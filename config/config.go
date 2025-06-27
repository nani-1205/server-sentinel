package config

import (
	"io/ioutil"
	"log"

	"gopkg.in/yaml.v3"
)

// Server struct with both yaml and json tags for proper serialization
type Server struct {
	Name string `yaml:"name" json:"name"`
	Host string `yaml:"host" json:"host"`
	Port int    `yaml:"port" json:"port"`
	User string `yaml:"user" json:"user"`
}

type SMTP struct {
	Host     string   `yaml:"host"`
	Port     int      `yaml:"port"`
	Username string   `yaml:"username"`
	Password string   `yaml:"password"`
	From     string   `yaml:"from"`
	To       []string `yaml:"to"`
}

type Config struct {
	Servers    []Server `yaml:"servers"`
	SMTP       SMTP     `yaml:"smtp"`
	SSHKeyPath string   `yaml:"ssh_key_path"`
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