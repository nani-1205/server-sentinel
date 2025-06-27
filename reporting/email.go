package reporting

import (
	"fmt"
	"server-sentinel/config"

	"gopkg.in/gomail.v2"
)

func SendReport(filePath string) error {
	smtpConf := config.AppConfig.SMTP
	m := gomail.NewMessage()

	m.SetHeader("From", smtpConf.From)
	m.SetHeader("To", smtpConf.To...)
	m.SetHeader("Subject", fmt.Sprintf("Server Sentinel Health Report - %s", time.Now().Format("2006-01-02")))
	m.SetBody("text/html", "Please find the daily server health report attached.")
	m.Attach(filePath)

	d := gomail.NewDialer(smtpConf.Host, smtpConf.Port, smtpConf.Username, smtpConf.Password)

	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("could not send email: %w", err)
	}

	return nil
}