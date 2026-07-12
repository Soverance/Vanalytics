/*
  One-time cleanup of AuctionSales rows poisoned by the padded-slot decoder bug
  (fixed in SearchPacketCodec.DecodeHistoryResponse — the decoder read stale server-memory
  slots past the real entry count declared at 0x08).

  ⚠ ORDER MATTERS. DEPLOY THE DECODER FIX FIRST, THEN run this.
  The scraper crawls every 5 min; while the OLD decoder is live in prod it keeps inserting
  fresh garbage, so a purge run before the deploy is immediately refilled. Confirmed via
  ObservedAt timestamps: garbage rows were still being written on the day of the first purge
  attempt. Deploy (merge to main) the fix + ingestion guard, THEN run this once.

  A row is garbage if ANY orthogonal signal is implausible. Real AH sales ALWAYS have:
    - price in [1, 999,999,999]
    - SoldAt in [2002-05-16 (FFXI JP launch), now]
    - seller & buyer = 3-15 ASCII letters (FFXI names)
  Verified against real item 8837 data: Cloudspawn/Janini 40000 (2020), Trillium/Chocobou 500,
  Gasmanx/Namsag 50000000 — all kept; the `?`-laden / future-dated / >1B rows all match.

  Run Step 1 (preview) first. Confirm the counts + sample. Then run Step 2 — it COMMITS.
*/

------------------------------------------------------------------------
-- Step 1: PREVIEW — what will be deleted (read-only, no changes)
------------------------------------------------------------------------
DECLARE @epoch datetimeoffset = '2002-05-16T00:00:00+00:00';

SELECT
    (SELECT COUNT(*) FROM AuctionSales) AS total_rows,
    (SELECT COUNT(*) FROM AuctionSales
       WHERE Price <= 0 OR Price > 999999999
          OR SoldAt < @epoch OR SoldAt > SYSDATETIMEOFFSET()
          OR SellerName LIKE '%[^A-Za-z]%' OR LEN(SellerName) < 3 OR LEN(SellerName) > 15
          OR BuyerName  LIKE '%[^A-Za-z]%' OR LEN(BuyerName)  < 3 OR LEN(BuyerName)  > 15
    ) AS would_delete;

-- Sample of rows that would be deleted (sanity-check they are all garbage):
SELECT TOP 100 ItemId, ServerId, Price, SoldAt, SellerName, BuyerName, StackSize, ObservedAt
FROM AuctionSales
WHERE Price <= 0 OR Price > 999999999
   OR SoldAt < @epoch OR SoldAt > SYSDATETIMEOFFSET()
   OR SellerName LIKE '%[^A-Za-z]%' OR LEN(SellerName) < 3 OR LEN(SellerName) > 15
   OR BuyerName  LIKE '%[^A-Za-z]%' OR LEN(BuyerName)  < 3 OR LEN(BuyerName)  > 15
ORDER BY ItemId, SoldAt;
GO

------------------------------------------------------------------------
-- Step 2: DELETE and COMMIT. Run as its own batch after reviewing Step 1.
-- Explicit COMMIT in the same batch — no open transaction to leave dangling
-- (that was the bug in the first version of this script: COMMIT was commented
--  out, so the DELETE rolled back on disconnect and nothing was removed).
------------------------------------------------------------------------
BEGIN TRANSACTION;

DECLARE @epoch2 datetimeoffset = '2002-05-16T00:00:00+00:00';
DELETE FROM AuctionSales
WHERE Price <= 0 OR Price > 999999999
   OR SoldAt < @epoch2 OR SoldAt > SYSDATETIMEOFFSET()
   OR SellerName LIKE '%[^A-Za-z]%' OR LEN(SellerName) < 3 OR LEN(SellerName) > 15
   OR BuyerName  LIKE '%[^A-Za-z]%' OR LEN(BuyerName)  < 3 OR LEN(BuyerName)  > 15;

PRINT CONCAT(@@ROWCOUNT, ' implausible AuctionSales rows deleted.');

COMMIT TRANSACTION;
PRINT 'Committed.';
GO

------------------------------------------------------------------------
-- Step 3: VERIFY — should return 0 after the deploy + committed purge.
------------------------------------------------------------------------
DECLARE @epoch3 datetimeoffset = '2002-05-16T00:00:00+00:00';
SELECT COUNT(*) AS remaining_implausible
FROM AuctionSales
WHERE Price <= 0 OR Price > 999999999
   OR SoldAt < @epoch3 OR SoldAt > SYSDATETIMEOFFSET()
   OR SellerName LIKE '%[^A-Za-z]%' OR LEN(SellerName) < 3 OR LEN(SellerName) > 15
   OR BuyerName  LIKE '%[^A-Za-z]%' OR LEN(BuyerName)  < 3 OR LEN(BuyerName)  > 15;
GO
