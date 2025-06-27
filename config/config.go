package config

import (
	"io/ioutil"
	"log"

	"gopkg.in/yaml.v3"
)

// Server struct now includes optional Password and KeyPath fields.
// The `json:"-"` tag is a security measure to prevent these sensitive fields
// from ever being sent to the frontend API.
type Server struct {
	Name     string `yaml:"name" json:"name"`
	Host     string `yaml:"host" json:"host"`
	Port     int    `yaml:"port" json:"port"`
	User     string `yaml:"user" json:"user"`
	Password string `yaml:"password,omitempty" json:"-"`
	KeyPath  string `yaml:"key_path,omitempty" json:"-"`
}

type SMTP struct {
	Host     string   `yaml:"host"`
	Port     int      `yaml:"port"`
	Username string   `yaml:"username"`
	Password string   `yaml:"password"`
	From     string   `yaml:"from"`
	To       []string `yaml:"to"`
}

// Config struct no longer has a global SSHKeyPath.
type Config struct {
	Servers []Server `yaml:"servers"`
	SMTP    SMTP     `yaml:"smtp"`
}

var AppConfig Config

func LoadConfig(path string) error {
	data, err := ioutil.ReadFile(path)
	if err != nil {
		return err
	}

	err = yaml.Unmarshal(data, &AppConfig)
	if err != nil {
		return err
	}

	log.Println("Configuration loaded successfully.")
	return nil
}