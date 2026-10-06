-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "passwordHash" TEXT,
    "name" TEXT,
    "authProvider" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedImage" (
    "id" TEXT NOT NULL,
    "dailyEntryId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalFilename" TEXT,

    CONSTRAINT "UploadedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrExtraction" (
    "id" TEXT NOT NULL,
    "imageId" TEXT,
    "dailyEntryId" TEXT NOT NULL,
    "rawOcrText" TEXT,
    "extractedData" TEXT NOT NULL,
    "extractedDate" TIMESTAMP(3),
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meal" (
    "id" TEXT NOT NULL,
    "dailyEntryId" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "brand" TEXT,
    "foodName" TEXT,
    "quantity" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isDrink" BOOLEAN NOT NULL DEFAULT false,
    "calories" INTEGER,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "fiber" DOUBLE PRECISION,
    "sugar" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodConcept" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "aliases" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mergedIntoId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FoodConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodItemConcept" (
    "id" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "foodConceptId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodItemConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymptomRecord" (
    "id" TEXT NOT NULL,
    "dailyEntryId" TEXT NOT NULL,
    "freeTextNotes" TEXT NOT NULL,
    "overallRating" TEXT,
    "bloating" TEXT,
    "gas" TEXT,
    "crampsPain" TEXT,
    "diarrhea" BOOLEAN,
    "constipation" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SymptomRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymptomEvent" (
    "id" TEXT NOT NULL,
    "symptomRecordId" TEXT NOT NULL,
    "mealId" TEXT,
    "description" TEXT NOT NULL,
    "approximateTime" TEXT,
    "severity" TEXT,
    "symptomType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SymptomEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summaryText" TEXT NOT NULL,
    "observedData" TEXT NOT NULL,
    "aiInterpretation" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "dateRangeStart" TIMESTAMP(3),
    "dateRangeEnd" TIMESTAMP(3),
    "results" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "DailyEntry_userId_date_idx" ON "DailyEntry"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEntry_userId_date_key" ON "DailyEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "UploadedImage_dailyEntryId_idx" ON "UploadedImage"("dailyEntryId");

-- CreateIndex
CREATE INDEX "OcrExtraction_dailyEntryId_idx" ON "OcrExtraction"("dailyEntryId");

-- CreateIndex
CREATE INDEX "Meal_dailyEntryId_mealType_idx" ON "Meal"("dailyEntryId", "mealType");

-- CreateIndex
CREATE INDEX "FoodItem_mealId_idx" ON "FoodItem"("mealId");

-- CreateIndex
CREATE INDEX "FoodItem_rawText_idx" ON "FoodItem"("rawText");

-- CreateIndex
CREATE UNIQUE INDEX "FoodConcept_name_key" ON "FoodConcept"("name");

-- CreateIndex
CREATE INDEX "FoodConcept_name_idx" ON "FoodConcept"("name");

-- CreateIndex
CREATE INDEX "FoodItemConcept_foodItemId_idx" ON "FoodItemConcept"("foodItemId");

-- CreateIndex
CREATE INDEX "FoodItemConcept_foodConceptId_idx" ON "FoodItemConcept"("foodConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodItemConcept_foodItemId_foodConceptId_key" ON "FoodItemConcept"("foodItemId", "foodConceptId");

-- CreateIndex
CREATE UNIQUE INDEX "SymptomRecord_dailyEntryId_key" ON "SymptomRecord"("dailyEntryId");

-- CreateIndex
CREATE INDEX "SymptomRecord_dailyEntryId_idx" ON "SymptomRecord"("dailyEntryId");

-- CreateIndex
CREATE INDEX "SymptomRecord_overallRating_idx" ON "SymptomRecord"("overallRating");

-- CreateIndex
CREATE INDEX "SymptomEvent_symptomRecordId_idx" ON "SymptomEvent"("symptomRecordId");

-- CreateIndex
CREATE INDEX "SymptomEvent_mealId_idx" ON "SymptomEvent"("mealId");

-- CreateIndex
CREATE INDEX "WeeklyReport_userId_startDate_idx" ON "WeeklyReport"("userId", "startDate");

-- CreateIndex
CREATE INDEX "AnalysisSnapshot_userId_analysisType_generatedAt_idx" ON "AnalysisSnapshot"("userId", "analysisType", "generatedAt");

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedImage" ADD CONSTRAINT "UploadedImage_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrExtraction" ADD CONSTRAINT "OcrExtraction_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "UploadedImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrExtraction" ADD CONSTRAINT "OcrExtraction_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodConcept" ADD CONSTRAINT "FoodConcept_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "FoodConcept"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "FoodItemConcept" ADD CONSTRAINT "FoodItemConcept_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodItemConcept" ADD CONSTRAINT "FoodItemConcept_foodConceptId_fkey" FOREIGN KEY ("foodConceptId") REFERENCES "FoodConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomRecord" ADD CONSTRAINT "SymptomRecord_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomEvent" ADD CONSTRAINT "SymptomEvent_symptomRecordId_fkey" FOREIGN KEY ("symptomRecordId") REFERENCES "SymptomRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomEvent" ADD CONSTRAINT "SymptomEvent_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisSnapshot" ADD CONSTRAINT "AnalysisSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
