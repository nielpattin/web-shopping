## Thành viên nhóm:
| Họ và tên        | Mã sinh viên |
| ---------------- | ------------ |
| Trần Thành Long  | 23010070     |
| Bạch Quang Anh   | 22010434     |


### A Distributed Web App Shopping (Like Amazon, Shopee, Lazada, etc.)
- This project is a distributed web application that allows users to browse products, add them to their cart, and place orders. It uses MongoDB for data storage and Docker for containerization.

### Setup Instructions

#### Prerequisites
- Docker installed on your machine.

#### Run MongoDB Separately

```bash
docker run -d --name mongodb -p 27017:27017 -v mongodb_data:/data/db --restart unless-stopped mongo:latest
```