package serverops

import (
	"errors"
	"fmt"
	"io/ioutil"
	"net"
	"os"
	"path/filepath"
	"server-sentinel/config"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

type HealthReport struct {
	ServerName   string  `json:"serverName"`
	ServerHost   string  `json:"serverHost"`
	IsOnline     bool    `json:"isOnline"`
	Error        string  `json:"error"`
	CacheCleared bool    `json:"cacheCleared"`
	CPUUsage     float64 `json:"cpuUsage"`
	MemTotalMB   int     `json:"memTotalMB"`
	MemUsedMB    int     `json:"memUsedMB"`
	MemFreeMB    int     `json:"memFreeMB"`
	SwapTotalMB  int     `json:"swapTotalMB"`
	SwapUsedMB   int     `json:"swapUsedMB"`
	TopProcesses string  `json:"topProcesses"`
	Timestamp    string  `json:"timestamp"`
}

func getSigner(keyPath string) (ssh.Signer, error) {
	if strings.HasPrefix(keyPath, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("could not get user home dir: %w", err)
		}
		keyPath = filepath.Join(home, keyPath[2:])
	}

	key, err := ioutil.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("unable to read private key from %s: %w", keyPath, err)
	}
	return ssh.ParsePrivateKey(key)
}

// This function is now updated to handle both password and key authentication.
func executeSSH(s config.Server, cmd string) (string, error) {
	var authMethods []ssh.AuthMethod

	// Check for password first. If it exists, use it.
	if s.Password != "" {
		authMethods = append(authMethods, ssh.Password(s.Password))
	} else if s.KeyPath != "" {
		// If no password, check for a key path.
		signer, err := getSigner(s.KeyPath)
		if err != nil {
			return "", fmt.Errorf("failed to process key %s: %w", s.KeyPath, err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	} else {
		// If neither is provided, return an error.
		return "", errors.New("no authentication method (password or key_path) provided for server")
	}

	sshConfig := &ssh.ClientConfig{
		User: s.User,
		Auth: authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", s.Host, s.Port)
	conn, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return "", fmt.Errorf("failed to dial: %w", err)
	}
	defer conn.Close()

	session, err := conn.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	output, err := session.CombinedOutput(cmd)
	if err != nil {
		return string(output), fmt.Errorf("failed to run command: %w", err)
	}

	return string(output), nil
}

func PerformHealthCheck(server config.Server, wsLog func(msg string)) HealthReport {
	report := HealthReport{
		ServerName: server.Name,
		ServerHost: server.Host,
		Timestamp:  time.Now().Format(time.RFC3339),
	}

	// 1. Check if server is online
	wsLog(fmt.Sprintf("[%s] Pinging server...", server.Name))
	timeout := 2 * time.Second
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", server.Host, server.Port), timeout)
	if err != nil {
		report.IsOnline = false
		report.Error = "Server is unreachable"
		wsLog(fmt.Sprintf("[%s] ❌ Server is unreachable.", server.Name))
		return report
	}
	conn.Close()
	report.IsOnline = true
	wsLog(fmt.Sprintf("[%s] ✅ Server is online.", server.Name))

	// 2. Clear Cache (requires sudo NOPASSWD setup)
	wsLog(fmt.Sprintf("[%s] Attempting to clear cache...", server.Name))
	_, err = executeSSH(server, "sudo /bin/sh -c 'echo 3 > /proc/sys/vm/drop_caches'")
	if err != nil {
		report.CacheCleared = false
		wsLog(fmt.Sprintf("[%s] ⚠️ Failed to clear cache: %v", server.Name, err))
	} else {
		report.CacheCleared = true
		wsLog(fmt.Sprintf("[%s] ✅ Cache cleared successfully.", server.Name))
	}

	// 3. Get Health Metrics
	wsLog(fmt.Sprintf("[%s] Fetching health metrics...", server.Name))

	// CPU Usage
	cpuCmd := "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'"
	cpuOut, err := executeSSH(server, cpuCmd)
	if err == nil {
		report.CPUUsage, _ = strconv.ParseFloat(strings.TrimSpace(cpuOut), 64)
	}

	// Memory Usage
	memCmd := "free -m"
	memOut, err := executeSSH(server, memCmd)
	if err == nil {
		lines := strings.Split(memOut, "\n")
		if len(lines) > 1 {
			fields := strings.Fields(lines[1])
			if len(fields) >= 4 {
				report.MemTotalMB, _ = strconv.Atoi(fields[1])
				report.MemUsedMB, _ = strconv.Atoi(fields[2])
				report.MemFreeMB, _ = strconv.Atoi(fields[3])
			}
		}
		if len(lines) > 2 {
			fields := strings.Fields(lines[2])
			if len(fields) >= 3 {
				report.SwapTotalMB, _ = strconv.Atoi(fields[1])
				report.SwapUsedMB, _ = strconv.Atoi(fields[2])
			}
		}
	}

	// Top 5 processes by memory
	procCmd := "ps -eo comm,pmem --sort=-pmem | head -n 6"
	procOut, err := executeSSH(server, procCmd)
	if err == nil {
		report.TopProcesses = strings.TrimSpace(procOut)
	}

	wsLog(fmt.Sprintf("[%s] ✅ Metrics collected.", server.Name))
	return report
}

func RunAllChecks(wsLog func(msg string)) []HealthReport {
	servers := config.AppConfig.Servers
	reports := make([]HealthReport, len(servers))
	for i, server := range servers {
		reports[i] = PerformHealthCheck(server, wsLog)
	}
	return reports
}