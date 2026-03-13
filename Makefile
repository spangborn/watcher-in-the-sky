docker:
	npm run build && docker-compose build
up:
	docker-compose up -d

build-prod:
	npm run build && docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

up-prod: build-prod
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

down: 
	docker-compose down