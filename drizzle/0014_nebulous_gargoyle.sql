CREATE TABLE `dgm_archive` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int,
	`fitnessScore` varchar(20) NOT NULL,
	`codeSnapshotUrl` varchar(512),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dgm_archive_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `episodic_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`content` text NOT NULL,
	`embedding` text,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `episodic_memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `langgraph_checkpoints` (
	`thread_id` varchar(255) NOT NULL,
	`checkpoint_id` varchar(255) NOT NULL,
	`parent_checkpoint_id` varchar(255),
	`checkpoint_data` text NOT NULL,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `langgraph_checkpoints_thread_id_checkpoint_id_pk` PRIMARY KEY(`thread_id`,`checkpoint_id`)
);
