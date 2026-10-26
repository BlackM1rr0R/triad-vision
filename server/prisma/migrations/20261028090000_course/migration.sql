-- CreateTable
CREATE TABLE `Course` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `title` JSON NOT NULL,
    `description` JSON NULL,
    `disclaimer` JSON NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `autoEnrollStatuses` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(40) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Course_slug_key`(`slug`),
    INDEX `Course_published_sortOrder_idx`(`published`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseModule` (
    `id` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(40) NOT NULL,
    `title` JSON NOT NULL,
    `description` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CourseModule_courseId_sortOrder_idx`(`courseId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseLesson` (
    `id` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(40) NOT NULL,
    `moduleId` VARCHAR(40) NOT NULL,
    `kind` ENUM('VIDEO', 'TEXT', 'QUIZ') NOT NULL,
    `title` JSON NOT NULL,
    `body` JSON NULL,
    `minutes` INTEGER NULL,
    `videoKey` VARCHAR(200) NULL,
    `videoMime` VARCHAR(40) NULL,
    `videoSize` INTEGER NULL,
    `videoDuration` INTEGER NULL,
    `posterKey` VARCHAR(200) NULL,
    `subtitles` JSON NULL,
    `passMark` INTEGER NOT NULL DEFAULT 70,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CourseLesson_moduleId_sortOrder_idx`(`moduleId`, `sortOrder`),
    INDEX `CourseLesson_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseQuizQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(40) NOT NULL,
    `kind` ENUM('SINGLE', 'MULTIPLE') NOT NULL DEFAULT 'SINGLE',
    `prompt` JSON NOT NULL,
    `options` JSON NOT NULL,
    `correct` JSON NOT NULL,
    `explanation` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CourseQuizQuestion_lessonId_sortOrder_idx`(`lessonId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseEnrollment` (
    `id` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `source` VARCHAR(8) NOT NULL DEFAULT 'AUTO',
    `enrolledById` VARCHAR(40) NULL,
    `enrolledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `lastActivityAt` DATETIME(3) NULL,

    INDEX `CourseEnrollment_userId_idx`(`userId`),
    UNIQUE INDEX `CourseEnrollment_courseId_userId_key`(`courseId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseLessonProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `courseId` VARCHAR(40) NOT NULL,
    `lessonId` VARCHAR(40) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `watchedSeconds` INTEGER NOT NULL DEFAULT 0,
    `positionSeconds` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CourseLessonProgress_courseId_userId_idx`(`courseId`, `userId`),
    UNIQUE INDEX `CourseLessonProgress_userId_lessonId_key`(`userId`, `lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseQuizAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `courseId` VARCHAR(40) NOT NULL,
    `lessonId` VARCHAR(40) NOT NULL,
    `answers` JSON NOT NULL,
    `score` INTEGER NOT NULL,
    `passed` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CourseQuizAttempt_userId_lessonId_createdAt_idx`(`userId`, `lessonId`, `createdAt`),
    INDEX `CourseQuizAttempt_courseId_idx`(`courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseCertificate` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `courseId` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(40) NOT NULL,
    `holderName` VARCHAR(200) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CourseCertificate_number_key`(`number`),
    UNIQUE INDEX `CourseCertificate_code_key`(`code`),
    INDEX `CourseCertificate_userId_idx`(`userId`),
    UNIQUE INDEX `CourseCertificate_courseId_userId_key`(`courseId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
