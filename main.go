package main

import (
	"log"
	"net/http"
	"server-sentinel/config"
	"server-sentinel/handlers"
	"server-sentinel/scheduler"
)

func main() {
	// 1. Load configuration from file
	if err := config.LoadConfig("config.yaml"); err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// 2. Initialize the cron scheduler
	scheduler.InitScheduler()

	// 3. Set up HTTP routes
	handlers.SetupRoutes()

	// 4. Start the web server
	log.Println("Starting Server Sentinel web interface on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}