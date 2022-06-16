# Documentserver


## Configuration

.env

## Configuration Path

./.env

## Installation

$ docker build -t [repository]:[tag] .

$ docker run -d -p 9000:9000 [repository]:[tag]

## Logs

$ docker ps //To check container ID

$ docker logs [container ID]

# MongoDb

## Create Database

$ use document_signing

## Create Collection

$ db.createCollection("documents")