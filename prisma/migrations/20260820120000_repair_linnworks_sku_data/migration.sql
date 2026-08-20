-- Additive migration. Existing rows are retained and receive stable keys on the
-- next successful Linnworks catalog/sales sync.
ALTER TABLE `Product`
  ADD COLUMN `category` VARCHAR(191) NULL,
  ADD COLUMN `material` VARCHAR(191) NULL,
  ADD COLUMN `thickness` VARCHAR(191) NULL,
  ADD COLUMN `packQty` INTEGER NULL;

ALTER TABLE `ProductStock`
  ADD COLUMN `sourceLocationId` VARCHAR(191) NULL,
  MODIFY COLUMN `country` VARCHAR(191) NULL,
  MODIFY COLUMN `locationType` ENUM('FBA', 'FBM', 'WAREHOUSE', 'THIRD_PARTY', 'UNKNOWN') NOT NULL DEFAULT 'FBA';
CREATE UNIQUE INDEX `ProductStock_productId_sourceLocationId_key`
  ON `ProductStock`(`productId`, `sourceLocationId`);

ALTER TABLE `ProductChannel`
  ADD COLUMN `source` VARCHAR(191) NULL,
  ADD COLUMN `subSource` VARCHAR(191) NULL,
  ADD COLUMN `sourceRowId` VARCHAR(191) NULL,
  ADD COLUMN `externalReferenceId` VARCHAR(191) NULL,
  ADD COLUMN `ignoreSync` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `syncKey` VARCHAR(191) NULL,
  MODIFY COLUMN `channel` ENUM('AMAZON', 'EBAY', 'WALMART', 'SHOPIFY', 'ETSY', 'WEBSITE', 'OTHER') NOT NULL;
CREATE UNIQUE INDEX `ProductChannel_productId_syncKey_key`
  ON `ProductChannel`(`productId`, `syncKey`);

ALTER TABLE `ProductSalesMetric`
  ADD COLUMN `fulfillmentType` ENUM('FBA', 'MFN', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `source` VARCHAR(191) NULL,
  ADD COLUMN `subSource` VARCHAR(191) NULL,
  ADD COLUMN `syncKey` VARCHAR(191) NULL,
  MODIFY COLUMN `channel` ENUM('AMAZON', 'EBAY', 'WALMART', 'SHOPIFY', 'ETSY', 'WEBSITE', 'OTHER') NOT NULL;
CREATE UNIQUE INDEX `ProductSalesMetric_productId_syncKey_key`
  ON `ProductSalesMetric`(`productId`, `syncKey`);
