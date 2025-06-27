# Server Sentinel: Automated Server Health Monitoring & Reporting



Server Sentinel is a robust and modern web application built in Go to automate essential maintenance tasks and monitor the health of a fleet of remote servers. It performs daily cache clearing and gathers key performance metrics, presenting them through an intuitive web dashboard and sending detailed reports via email.

Server Sentinel includes features like automated daily health checks at 7:00 AM, flexible SSH key or password authentication, monitoring of server reachability, CPU usage, memory and swap statistics, top 5 memory-consuming processes, and XLSX report generation. The report is emailed via SMTP, and users can trigger manual health checks through a responsive web dashboard, which also includes live logs and a dark/light theme toggle.


## Tech Stack

- Backend: Go (Golang)
  - [golang.org/x/crypto/ssh](https://pkg.go.dev/golang.org/x/crypto/ssh)
  - [github.com/robfig/cron/v3](https://pkg.go.dev/github.com/robfig/cron/v3)
  - [github.com/xuri/excelize/v2](https://pkg.go.dev/github.com/xuri/excelize/v2)
  - [gopkg.in/gomail.v2](https://pkg.go.dev/gopkg.in/gomail.v2)
  - [github.com/gorilla/websocket](https://pkg.go.dev/github.com/gorilla/websocket)
  - [gopkg.in/yaml.v3](https://pkg.go.dev/gopkg.in/yaml.v3)
- Frontend: HTML, CSS, JavaScript
- Production Process Managers: [systemd](https://systemd.io/), [PM2](https://pm2.io/)

## Prerequisites

- Go 1.18 or newer must be installed.
- Server Sentinel host machine must have SSH access (port 22) to target servers.
- The SSH user on each target server should:
  - Have a valid login with either a password or public/private SSH key pair.
  - Be configured in `/etc/sudoers` to run `echo 3 > /proc/sys/vm/drop_caches` without a password:
    ```
    your_user ALL=(ALL) NOPASSWD: /bin/sh -c 'echo 3 > /proc/sys/vm/drop_caches'
    ```
- SMTP credentials for sending the XLSX report via email (use App Password if using Gmail with 2FA).

## Installation

```bash
git clone https://github.com/nani-1205/server-sentinel.git
cd server-sentinel
rm -f go.mod go.sum
go mod init server-sentinel
go mod tidy
go build -o server-sentinel-app main.go
```

## Configuration

Create a file named `config.yaml` in the project root:

```yaml
servers:
  - name: "Web Server (SSH Key)"
    host: "18.60.39.71"
    port: 22
    user: "ec2-user"
    key_path: "/path/to/key.pem"

  - name: "DB Server (Password)"
    host: "192.168.1.11"
    port: 22
    user: "db_user"
    password: "Password123"

smtp:
  host: "smtp.gmail.com"
  port: 587
  username: "your_email@gmail.com"
  password: "your_app_password"
  from: "Server Sentinel <your_email@gmail.com>"
  to:
    - "recipient@example.com"
```

> ⚠️ **Important:** Do not commit this file to version control. Keep it secure and restrict its permissions (`chmod 600 config.yaml`).

## Running the Application

### Option 1: Development Mode

```bash
# Run the binary
./server-sentinel-app

# OR run directly from source
go run main.go
```

The web interface is accessible at `http://localhost:8080`.

### Option 2: Production Mode (systemd)

```bash
sudo nano /etc/systemd/system/server-sentinel.service
```

Paste the following:

```ini
[Unit]
Description=Server Sentinel Health Check Service
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/path/to/server-sentinel
ExecStart=/path/to/server-sentinel/server-sentinel-app
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable server-sentinel
sudo systemctl start server-sentinel
```

To view logs:

```bash
sudo journalctl -u server-sentinel.service -f
```

### Option 3: Production Mode (PM2)

```bash
pm2 start ./server-sentinel-app --name "ServerSentinel" --cwd /path/to/server-sentinel
pm2 save
pm2 startup
```

To monitor:

```bash
pm2 list
pm2 logs ServerSentinel
```

## Web Dashboard Usage

- Visit: `http://<your-server-ip>:8080`
- View server cards with health data.
- Click "Run All Checks" or select individual servers to run.
- Use "Live Logs" to view real-time output.
- Toggle dark/light theme in header.
- Click on any server card to see detailed metrics and run isolated health checks.

## Contributing

We welcome contributions! Please:

- Open issues
- Submit PRs
- Suggest features or improvements

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

> ⭐️ Don't forget to **star** this repo if you find it helpful!