/*
  One-time cleanup of AuctionSales rows poisoned by the padded-slot decoder bug
  (fixed 2026-07-12 in SearchPacketCodec.DecodeHistoryResponse — the decoder was
  reading stale server-memory slots past the real entry count declared at 0x08).

  Live example (Gold. Kit 25, item 8837, Siren): the one real sale was
  40,000 g / 2020-05-20 (Cloudspawn -> Janini); the garbage padded slot decoded as
  price 213,959,576 with a 1976 date and non-name characters.

  A row is garbage if ANY orthogonal signal is implausible. Real AH sales ALWAYS have:
    - price in [1, 999,999,999]
    - SoldAt in [2002-05-16 (FFXI JP launch), now]
    - seller & buyer = 3-15 ASCII letters (FFXI names)
  These are near-zero-false-positive: a legitimate sale satisfies all three.
  NOTE: price alone is NOT sufficient (the live garbage price 213M looked valid) —
  the timestamp and name signals are what catch plausibly-priced garbage.

  RUN THE PREVIEW (Step 1) FIRST. Eyeball the sample + counts. Only then run Step 2.
*/

------------------------------------------------------------------------
-- Step 1: PREVIEW — what would be deleted (no changes made)
------------------------------------------------------------------------
DECLARE @epoch datetimeoffset = '2002-05-16T00:00:00+00:00';

;WITH garbage AS (
    SELECT *
    FROM AuctionSales
    WHERE Price <= 0 OR Price > 999999999
       OR SoldAt < @epoch OR SoldAt > SYSDATETIMEOFFSET()
       OR SellerName LIKE '%[^A-Za-z]%' OR LEN(SellerName) < 3 OR LEN(SellerName) > 15
       OR BuyerName  LIKE '%[^A-Za-z]%' OR LEN(BuyerName)  < 3 OR LEN(BuyerName)  > 15
)
SELECT
    (SELECT COUNT(*) FROM AuctionSales)                                        AS total_rows,
    (SELECT COUNT(*) FROM garbage)                                             AS would_delete,
    (SELECT COUNT(*) FROM AuctionSales) - (SELECT COUNT(*) FROM garbage)       AS would_remain,
    (SELECT COUNT(DISTINCT ItemId) FROM garbage)                              AS affected_items;

-- Sample of rows that would be deleted (sanity-check these are all garbage):
DECLARE @epoch2 datetimeoffset = '2002-05-16T00:00:00+00:00';
SELECT TOP 100 ItemId, ServerId, Price, SoldAt, SellerName, BuyerName, StackSize
FROM AuctionSales
WHERE Price <= 0 OR Price > 999999999
   OR SoldAt < @epoch2 OR SoldAt > SYSDATETIMEOFFSET()
   OR SellerName LIKE '%[^A-Za-z]%' OR LEN(SellerName) < 3 OR LEN(SellerName) > 15
   OR BuyerName  LIKE '%[^A-Za-z]%' OR LEN(BuyerName)  < 3 OR LEN(BuyerName)  > 15
ORDER BY ItemId, SoldAt;

------------------------------------------------------------------------
-- Step 2: DELETE — run only after reviewing the preview above.
-- Wrapped in an explicit transaction so you can ROLLBACK if the count surprises you.
------------------------------------------------------------------------
/*
BEGIN TRANSACTION;

DECLARE @epoch3 datetimeoffset = '2002-05-16T00:00:00+00:00';
DELETE FROM AuctionSales
WHERE Price <= 0 OR Price > 999999999
   OR SoldAt < @epoch3 OR SoldAt > SYSDATETIMEOFFSET()
   OR SellerName LIKE '%[^A-Za-z]%' OR LEN(SellerName) < 3 OR LEN(SellerName) > 15
   OR BuyerName  LIKE '%[^A-Za-z]%' OR LEN(BuyerName)  < 3 OR LEN(BuyerName)  > 15;

PRINT CONCAT(@@ROWCOUNT, ' implausible AuctionSales rows deleted.');

-- Review, then choose one:
-- COMMIT TRANSACTION;
-- ROLLBACK TRANSACTION;
*/
