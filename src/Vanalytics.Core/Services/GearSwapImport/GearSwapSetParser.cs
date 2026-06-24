using Loretta.CodeAnalysis;
using Loretta.CodeAnalysis.Lua;
using Loretta.CodeAnalysis.Lua.Syntax;

namespace Vanalytics.Core.Services.GearSwapImport;

/// <summary>
/// Constrained evaluator over a GearSwap .lua file. Reconstructs gear SET TABLES only:
/// it interprets sets.* assignments, table constructors, set_combine(), references to
/// local/global table variables (e.g. gear.X), and literal string concatenation.
/// All control flow and function bodies are ignored. Sets it cannot fully evaluate are
/// skipped and reported via ParseResult.Warnings — they never throw.
/// </summary>
public static class GearSwapSetParser
{
    public static ParseResult Parse(string source)
    {
        var warnings = new List<string>();
        var sets = new List<ParsedSet>();

        SyntaxTree tree;
        try
        {
            tree = LuaSyntaxTree.ParseText(source);
        }
        catch (Exception)
        {
            return new ParseResult(sets, new[] { "The file could not be parsed as Lua." });
        }

        var root = (CompilationUnitSyntax)tree.GetRoot();
        var env = new EvalEnvironment();

        foreach (var stmt in DescendantStatements(root))
        {
            if (stmt is not AssignmentStatementSyntax assign) continue;

            var targets = assign.Variables.ToList();
            var values = assign.EqualsValues.Values.ToList();
            for (var i = 0; i < targets.Count && i < values.Count; i++)
            {
                var path = TryReadKeyPath(targets[i], out var root0);
                var value = values[i];

                if (root0 == "sets" && path is not null)
                {
                    try
                    {
                        var slots = SetEvaluator.Evaluate(value, env, warnings);
                        if (slots is null) { warnings.Add($"Skipped set '{KeyPathText(path)}' (could not evaluate its value)."); continue; }
                        var ps = new ParsedSet(KeyPathText(path), SetNaming.FriendlyName(path), SetNaming.Category(path), slots);
                        env.Sets[KeyPathText(path)] = slots;
                        sets.Add(ps);
                    }
                    catch (Exception)
                    {
                        warnings.Add($"Skipped set '{KeyPathText(path)}' (unsupported expression).");
                    }
                }
                else if (root0 is not null && path is not null && value is TableConstructorExpressionSyntax)
                {
                    env.TryRecordVariable(root0, path, value);
                }
            }
        }

        return new ParseResult(sets, warnings);
    }

    private static IEnumerable<StatementSyntax> DescendantStatements(SyntaxNode node) =>
        node.DescendantNodes().OfType<StatementSyntax>();

    private static string KeyPathText(IReadOnlyList<SetKeySegment> segs) =>
        string.Join(".", segs.Select(s => s.Text));

    /// <summary>Reads sets.precast.WS['Savage Blade'] into (root="sets",
    /// segments=[precast, WS, "Savage Blade"]). Null segments if not a simple access chain.</summary>
    private static IReadOnlyList<SetKeySegment>? TryReadKeyPath(ExpressionSyntax expr, out string? root)
    {
        var segs = new List<SetKeySegment>();
        root = null;
        var cur = expr;

        while (true)
        {
            switch (cur)
            {
                case MemberAccessExpressionSyntax m:
                    segs.Insert(0, new SetKeySegment(m.MemberName.Text, IsBracket: false));
                    cur = m.Expression;
                    break;
                case ElementAccessExpressionSyntax e:
                    if (e.KeyExpression is LiteralExpressionSyntax { Token.Value: string key })
                        segs.Insert(0, new SetKeySegment(key, IsBracket: true));
                    else
                        return null;
                    cur = e.Expression;
                    break;
                case IdentifierNameSyntax id:
                    root = id.Name;
                    return segs;
                default:
                    return null;
            }
        }
    }
}

internal sealed class EvalEnvironment
{
    public Dictionary<string, IReadOnlyList<ParsedSlot>> Sets { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, TableConstructorExpressionSyntax> Tables { get; } = new(StringComparer.OrdinalIgnoreCase);

    public void TryRecordVariable(string root, IReadOnlyList<SetKeySegment> segs, ExpressionSyntax value)
    {
        if (value is TableConstructorExpressionSyntax t)
            Tables[string.Join(".", new[] { root }.Concat(segs.Select(s => s.Text)))] = t;
    }
}

internal static class SetEvaluator
{
    public static IReadOnlyList<ParsedSlot>? Evaluate(ExpressionSyntax value, EvalEnvironment env, List<string> warnings)
    {
        var table = ResolveToTable(value, env);
        if (table is null) return null;

        var slots = new List<ParsedSlot>();
        foreach (var field in table.Fields)
        {
            var key = FieldKey(field);
            if (key is null) continue;
            if (!SlotKeyMap.TryToInternal(key, out var slot)) continue;

            var fieldValue = FieldValue(field);
            if (fieldValue is null) continue;

            var (name, augments) = ReadItem(fieldValue);
            if (name is null) continue;
            slots.Add(new ParsedSlot(slot, name, augments));
        }
        return slots;
    }

    private static TableConstructorExpressionSyntax? ResolveToTable(ExpressionSyntax value, EvalEnvironment env)
    {
        return value switch
        {
            TableConstructorExpressionSyntax t => t,
            _ => null,
        };
    }

    private static string? FieldKey(TableFieldSyntax field) => field switch
    {
        IdentifierKeyedTableFieldSyntax k => k.Identifier.Text,
        ExpressionKeyedTableFieldSyntax e when e.Key is LiteralExpressionSyntax { Token.Value: string s } => s,
        _ => null,
    };

    private static ExpressionSyntax? FieldValue(TableFieldSyntax field) => field switch
    {
        IdentifierKeyedTableFieldSyntax k => k.Value,
        ExpressionKeyedTableFieldSyntax e => e.Value,
        _ => null,
    };

    private static (string? Name, IReadOnlyList<string> Augments) ReadItem(ExpressionSyntax value)
    {
        if (value is LiteralExpressionSyntax { Token.Value: string s })
            return (s, Array.Empty<string>());

        if (value is TableConstructorExpressionSyntax t)
        {
            string? name = null;
            var augs = new List<string>();
            foreach (var f in t.Fields)
            {
                var key = FieldKey(f);
                var fv = FieldValue(f);
                if (key is null || fv is null) continue;
                if (string.Equals(key, "name", StringComparison.OrdinalIgnoreCase) &&
                    fv is LiteralExpressionSyntax { Token.Value: string nm })
                    name = nm;
                else if (string.Equals(key, "augments", StringComparison.OrdinalIgnoreCase) &&
                         fv is TableConstructorExpressionSyntax at)
                    foreach (var af in at.Fields)
                        if (FieldValue(af) is LiteralExpressionSyntax { Token.Value: string av })
                            augs.Add(av);
            }
            return (name, augs);
        }

        return (null, Array.Empty<string>());
    }
}
