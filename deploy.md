## Deploy setup note 2024

Start the production container with `.env` same as `.env.production`
```bash
docker compose -f docker-compose.yml up -d
```

Then enter the `course-mongo` container with
```bash
docker exec -it course-mongo mongosh
```
And execute the following commands:
```sh
use admin
db.auth("eeinfo", "R9ujPAQBk4X2fdkv")

use ntuee-course
db.createUser(
    {
        user: "eeinfo",
        pwd: "R9ujPAQBk4X2fdkv",
        roles:[
            {
                role: "dbOwner",
                db: "ntuee-course"
            }
        ]
    }
)

db.grantRolesToUser("eeinfo", "dbOwner")
```

Quit from the mongo container, then enter the `course-backend` container
```bash
docker exec -it course-backend sh
```

Execute the command to reset database
```bash
npm run database reset
```
And set the admin password
```bash
npm run database admin -- -p admin
```
