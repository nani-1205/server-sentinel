package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"server-sentinel/config"
	"server-sentinel/reporting"
	"server-sentinel/serverops"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // Allow all origins
}

var (
	lastReportData []serverops.HealthReport
	mu             sync.Mutex
)

// Define the structure for messages from the client
type ClientMessage struct {
	Action  string   `json:"action"`
	Servers []string `json:"servers"`
}

// FullProcess now takes a list of servers to run on
func FullProcess(serversToRun []config.Server, wsLog func(msg string)) {
	if len(serversToRun) == 0 {
		wsLog("⚠️ No servers selected to run.")
		wsLog("🏁 Process complete.")
		return
	}

	wsLog("🚀 Starting health check process...")

	reports := make([]serverops.HealthReport, len(serversToRun))
	for i, server := range serversToRun {
		reports[i] = serverops.PerformHealthCheck(server, wsLog)
	}

	mu.Lock()
	// When updating, we should merge this with existing data or decide on a strategy.
	// For now, we'll just overwrite with the latest run's data.
	lastReportData = reports
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

	wsLogger := func(msg string) {
		log.Println("WS LOG:", msg)
		if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
			log.Println("WS write error:", err)
		}
	}

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS read error: %v", err)
			} else {
				log.Printf("Client disconnected from WebSocket.")
			}
			break
		}

		var msg ClientMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			wsLogger(fmt.Sprintf("❌ Invalid message format: %v", err))
			continue
		}

		if msg.Action == "run" {
			var serversToRun []config.Server
			// If "all" is specified, or if the list is empty, run on all servers.
			if len(msg.Servers) == 0 || (len(msg.Servers) == 1 && msg.Servers[0] == "all") {
				serversToRun = config.AppConfig.Servers
			} else {
				// Filter servers based on the names provided
				for _, serverName := range msg.Servers {
					for _, s := range config.AppConfig.Servers {
						if s.Name == serverName {
							serversToRun = append(serversToRun, s)
						}
					}
				}
			}
			go FullProcess(serversToRun, wsLogger)
		}
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

// New handler to get the server list from config
func HandleGetServerList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config.AppConfig.Servers)
}

func SetupRoutes() {
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/index.html")
	})

	http.HandleFunc("/ws/run", HandleWebSocket)
	http.HandleFunc("/api/latest-report", HandleGetLatestReport)
	// Add the new API endpoint
	http.HandleFunc("/api/servers", HandleGetServerList)
}