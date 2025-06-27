package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"server-sentinel/reporting"
	"server-sentinel/serverops"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // Allow all origins
}

// This will hold the last report's data for quick access by the API
var (
	lastReportData []serverops.HealthReport
	mu             sync.Mutex
)

// Main function that is called by scheduler and manual trigger
func FullProcess(wsLog func(msg string)) {
	wsLog("🚀 Starting health check process...")
	reports := serverops.RunAllChecks(wsLog)

	mu.Lock()
	lastReportData = reports // Update the in-memory cache
	mu.Unlock()

	filePath, err := reporting.CreateReport(reports)
	if err != nil {
		wsLog(fmt.Sprintf("❌ Error creating report: %v", err))
		return
	}
	wsLog(fmt.Sprintf("✅ Report created: %s", filePath))

	err = reporting.SendReport(filePath)
	if err != nil {
		wsLog(fmt.Sprintf("❌ Error sending email: %v", err))
		return
	}
	wsLog("✅ Email sent successfully.")
	wsLog("🏁 Process complete.")
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Println("Client connected via WebSocket.")

	// Create a logger function that sends messages over the WebSocket
	wsLogger := func(msg string) {
		log.Println("WS LOG:", msg)
		if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
			log.Println("WS write error:", err)
		}
	}

	for {
		// We can add more complex communication, but for now, we just trigger the run
		_, _, err := conn.ReadMessage()
		if err != nil {
			log.Println("WS read error:", err)
			break
		}
		
		// Run the process in a new goroutine to not block the WebSocket reader
		go FullProcess(wsLogger)
	}
}

func HandleGetLatestReport(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()

	if lastReportData == nil {
		http.Error(w, "No report data available yet. Please run a check first.", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(lastReportData)
}

func SetupRoutes() {
	// Serve static files (HTML, CSS, JS)
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/index.html")
	})

	// API and WebSocket endpoints
	http.HandleFunc("/ws/run", HandleWebSocket)
	http.HandleFunc("/api/latest-report", HandleGetLatestReport)
}