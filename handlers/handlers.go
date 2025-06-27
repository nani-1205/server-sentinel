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

	"github.com/gorilla/mux" // <-- Import the new router
	"github.com/gorilla/websocket"
)

// --- THIS PART OF THE FILE IS THE SAME ---

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}
var (
	lastReportData []serverops.HealthReport
	mu             sync.Mutex
)
type ClientMessage struct {
	Action  string   `json:"action"`
	Servers []string `json:"servers"`
}
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
	if err != nil { log.Println("Upgrade error:", err); return }
	defer conn.Close()
	log.Println("Client connected via WebSocket.")
	wsLogger := func(msg string) {
		log.Println("WS LOG:", msg)
		if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil { log.Println("WS write error:", err) }
	}
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) { log.Printf("WS read error: %v", err) } else { log.Printf("Client disconnected from WebSocket.") }
			break
		}
		var msg ClientMessage
		if err := json.Unmarshal(message, &msg); err != nil { wsLogger(fmt.Sprintf("❌ Invalid message format: %v", err)); continue }
		if msg.Action == "run" {
			var serversToRun []config.Server
			if len(msg.Servers) == 0 || (len(msg.Servers) == 1 && msg.Servers[0] == "all") { serversToRun = config.AppConfig.Servers } else {
				serverMap := make(map[string]bool); for _, name := range msg.Servers { serverMap[name] = true }; for _, s := range config.AppConfig.Servers { if serverMap[s.Name] { serversToRun = append(serversToRun, s) } }
			}
			go FullProcess(serversToRun, wsLogger)
		}
	}
}
func HandleGetLatestReport(w http.ResponseWriter, r *http.Request) {
	mu.Lock(); defer mu.Unlock()
	if lastReportData == nil { w.Header().Set("Content-Type", "application/json"); w.Write([]byte("[]")); return }
	w.Header().Set("Content-Type", "application/json"); json.NewEncoder(w).Encode(lastReportData)
}
func HandleGetServerList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json"); json.NewEncoder(w).Encode(config.AppConfig.Servers)
}


// --- THIS IS THE NEW AND CORRECTED ROUTING SETUP ---

// NewRouter creates and configures a new gorilla/mux router.
func NewRouter() *mux.Router {
	router := mux.NewRouter().StrictSlash(true)

	// API Routes - These are handled by specific Go functions.
	// We group them under an /api subrouter for clarity.
	apiRouter := router.PathPrefix("/api").Subrouter()
	apiRouter.HandleFunc("/servers", HandleGetServerList).Methods("GET")
	apiRouter.HandleFunc("/latest-report", HandleGetLatestReport).Methods("GET")

	// WebSocket Route
	router.HandleFunc("/ws/run", HandleWebSocket)
	
	// Static File Server - This serves CSS, JS, etc.
	// The PathPrefix ensures it only handles requests starting with /static/
	staticFileHandler := http.StripPrefix("/static/", http.FileServer(http.Dir("./static/")))
	router.PathPrefix("/static/").Handler(staticFileHandler)

	// Frontend Catch-All Route - This MUST be last.
	// It serves the index.html for any GET request that hasn't been matched yet.
	// This is crucial for single-page applications.
	router.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/index.html")
	}).Methods("GET")

	return router
}