ALTER TABLE `plantPhotos` MODIFY COLUMN `photoKey` varchar(500);--> statement-breakpoint
ALTER TABLE `cycles` ADD `motherPlantId` int;--> statement-breakpoint
ALTER TABLE `cycles` ADD CONSTRAINT `cycles_motherPlantId_plants_id_fk` FOREIGN KEY (`motherPlantId`) REFERENCES `plants`(`id`) ON DELETE no action ON UPDATE no action;