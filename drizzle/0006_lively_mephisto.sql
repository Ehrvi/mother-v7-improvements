CREATE TABLE `knowledge_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` enum('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending',
	`papersCount` int DEFAULT 0,
	`chunksCount` int DEFAULT 0,
	`qualityScore` varchar(20),
	`cost` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `knowledge_areas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paper_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paperId` int NOT NULL,
	`chunkIndex` int NOT NULL,
	`text` text NOT NULL,
	`embedding` text NOT NULL,
	`tokenCount` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paper_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`knowledgeAreaId` int NOT NULL,
	`arxivId` varchar(50) NOT NULL,
	`title` text NOT NULL,
	`authors` text,
	`abstract` text,
	`publishedDate` timestamp,
	`pdfUrl` varchar(500),
	`citationCount` int DEFAULT 0,
	`qualityScore` varchar(20),
	`chunksCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `papers_id` PRIMARY KEY(`id`),
	CONSTRAINT `papers_arxivId_unique` UNIQUE(`arxivId`)
);
--> statement-breakpoint
CREATE TABLE `study_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`knowledgeAreaId` int NOT NULL,
	`status` enum('pending','discovering','retrieving','processing','indexing','validating','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int DEFAULT 0,
	`total` int DEFAULT 0,
	`currentStep` varchar(255),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `study_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `paper_chunks` ADD CONSTRAINT `paper_chunks_paperId_papers_id_fk` FOREIGN KEY (`paperId`) REFERENCES `papers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `papers` ADD CONSTRAINT `papers_knowledgeAreaId_knowledge_areas_id_fk` FOREIGN KEY (`knowledgeAreaId`) REFERENCES `knowledge_areas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_jobs` ADD CONSTRAINT `study_jobs_knowledgeAreaId_knowledge_areas_id_fk` FOREIGN KEY (`knowledgeAreaId`) REFERENCES `knowledge_areas`(`id`) ON DELETE cascade ON UPDATE no action;