CREATE TABLE `ab_test_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`queryId` int,
	`variant` enum('control','critical_thinking') NOT NULL,
	`qualityScore` int NOT NULL,
	`latencyMs` int NOT NULL,
	`costUsd` varchar(20) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ab_test_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_config_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
ALTER TABLE `ab_test_metrics` ADD CONSTRAINT `ab_test_metrics_queryId_queries_id_fk` FOREIGN KEY (`queryId`) REFERENCES `queries`(`id`) ON DELETE no action ON UPDATE no action;