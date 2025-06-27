package reporting

import (
	"fmt"
	"os"
	"path/filepath"
	"server-sentinel/serverops"
	"time"

	"github.com/xuri/excelize/v2"
)

func CreateReport(reports []serverops.HealthReport) (string, error) {
	f := excelize.NewFile()
	sheetName := "Health Report"
	
	// Set the name of the default sheet created by NewFile()
	f.SetSheetName("Sheet1", sheetName)
	
	// Get the index of our newly named sheet
	// f.GetSheetIndex returns (int, error), so we must handle both.
	// We ignore the error with the blank identifier '_'.
	index, err := f.GetSheetIndex(sheetName)
	if err != nil {
		// If for some reason we can't get the sheet index, we can't proceed.
		return "", fmt.Errorf("failed to get sheet index for '%s': %w", sheetName, err)
	}

	// Set Headers
	headers := []string{"Server Name", "Status", "Timestamp", "Cache Cleared", "CPU Usage (%)", "Mem Total (MB)", "Mem Used (MB)", "Mem Free (MB)", "Swap Total (MB)", "Swap Used (MB)", "Top 5 Processes by Memory", "Error"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
	}

	// Style for header
	style, err := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#E0E0E0"}, Pattern: 1},
	})
	if err == nil { // Only apply style if creating it was successful
		f.SetRowStyle(sheetName, 1, 1, style)
	}


	// Populate Data
	for i, r := range reports {
		row := i + 2
		status := "Online"
		if !r.IsOnline {
			status = "Offline"
		}

		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), r.ServerName)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), status)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", row), r.Timestamp)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", row), r.CacheCleared)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", row), r.CPUUsage)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", row), r.MemTotalMB)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", row), r.MemUsedMB)
		f.SetCellValue(sheetName, fmt.Sprintf("H%d", row), r.MemFreeMB)
		f.SetCellValue(sheetName, fmt.Sprintf("I%d", row), r.SwapTotalMB)
		f.SetCellValue(sheetName, fmt.Sprintf("J%d", row), r.SwapUsedMB)
		f.SetCellValue(sheetName, fmt.Sprintf("K%d", row), r.TopProcesses)
		f.SetCellValue(sheetName, fmt.Sprintf("L%d", row), r.Error)
	}

	f.SetActiveSheet(index)

	// Ensure reports directory exists
	if _, err := os.Stat("reports"); os.IsNotExist(err) {
		os.Mkdir("reports", 0755)
	}

	filename := fmt.Sprintf("Health_Report_%s.xlsx", time.Now().Format("2006-01-02_15-04-05"))
	fullPath := filepath.Join("reports", filename)

	if err := f.SaveAs(fullPath); err != nil {
		return "", err
	}

	return fullPath, nil
}