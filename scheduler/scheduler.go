package scheduler

import (
	"log"
	"server-sentinel/reporting"
	"server-sentinel/serverops"

	"github.com/robfig/cron/v3"
)

var JobRunner *cron.Cron

func scheduledJob() {
	log.Println("Starting scheduled daily health check...")
	// Use a dummy logger for scheduled runs as there's no WebSocket client
	dummyLogger := func(msg string) { log.Println(msg) }
	
	reports := serverops.RunAllChecks(dummyLogger)

	filePath, err := reporting.CreateReport(reports)
	if err != nil {
		log.Printf("Error creating XLSX report: %v\n", err)
		return
	}
	log.Printf("Successfully created report: %s\n", filePath)

	err = reporting.SendReport(filePath)
	if err != nil {
		log.Printf("Error sending email report: %v\n", err)
		return
	}
	log.Println("Successfully sent email report.")
}

func InitScheduler() {
	JobRunner = cron.New()
	// Schedule to run at 7:00 AM every day
	JobRunner.AddFunc("0 7 * * *", scheduledJob)
	JobRunner.Start()
	log.Println("Cron scheduler initialized. Job scheduled for 7:00 AM daily.")
}