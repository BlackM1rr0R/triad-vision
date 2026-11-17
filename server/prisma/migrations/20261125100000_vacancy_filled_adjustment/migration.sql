-- Free places per vacancy (lib/vacancyPlaces): staff correction of the filled count.
ALTER TABLE `Vacancy` ADD COLUMN `filledAdjustment` INTEGER NOT NULL DEFAULT 0;
