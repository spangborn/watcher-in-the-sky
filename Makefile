docker:
	docker-compose build
up:
	docker-compose up -d

build-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

up-prod: build-prod
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

down: 
	docker-compose down