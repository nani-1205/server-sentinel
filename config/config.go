package config

import (
	"io/ioutil"
	"log"

	"gopkg.in/yaml.v3"
)

type Server struct {
	Name string `yaml:"name"`
	Host string `yaml:"host"`
	Port int    `yaml:"port"`
	User string `yaml:"user"`
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