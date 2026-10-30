-- German language progress: stored self-test attempts, vocabulary trainer (words, SM-2 state per user, practice days).

-- CreateTable
CREATE TABLE `GermanTestAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `estimated` VARCHAR(4) NOT NULL,
    `correct` INTEGER NOT NULL,
    `total` INTEGER NOT NULL,
    `percent` INTEGER NOT NULL,
    `levels` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GermanTestAttempt_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GermanWord` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `level` VARCHAR(4) NOT NULL,
    `field` VARCHAR(20) NOT NULL,
    `de` VARCHAR(120) NOT NULL,
    `article` VARCHAR(3) NULL,
    `plural` VARCHAR(120) NULL,
    `example` VARCHAR(300) NULL,
    `translations` JSON NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `published` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `GermanWord_slug_key`(`slug`),
    INDEX `GermanWord_level_field_idx`(`level`, `field`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GermanWordProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `wordId` VARCHAR(191) NOT NULL,
    `repetitions` INTEGER NOT NULL DEFAULT 0,
    `easiness` DOUBLE NOT NULL DEFAULT 2.5,
    `intervalDays` INTEGER NOT NULL DEFAULT 0,
    `dueAt` DATETIME(3) NOT NULL,
    `reviews` INTEGER NOT NULL DEFAULT 0,
    `correct` INTEGER NOT NULL DEFAULT 0,
    `lapses` INTEGER NOT NULL DEFAULT 0,
    `lastGrade` INTEGER NULL,
    `lastReviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GermanWordProgress_userId_dueAt_idx`(`userId`, `dueAt`),
    UNIQUE INDEX `GermanWordProgress_userId_wordId_key`(`userId`, `wordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GermanPracticeDay` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `reviews` INTEGER NOT NULL DEFAULT 0,
    `correct` INTEGER NOT NULL DEFAULT 0,
    `newWords` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GermanPracticeDay_userId_day_key`(`userId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GermanTestAttempt` ADD CONSTRAINT `GermanTestAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GermanWordProgress` ADD CONSTRAINT `GermanWordProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GermanWordProgress` ADD CONSTRAINT `GermanWordProgress_wordId_fkey` FOREIGN KEY (`wordId`) REFERENCES `GermanWord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GermanPracticeDay` ADD CONSTRAINT `GermanPracticeDay_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
