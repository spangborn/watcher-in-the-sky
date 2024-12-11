docker:
	docker-compose build
up:
	docker-compose up -d

up-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

down: 
	docker-compose down