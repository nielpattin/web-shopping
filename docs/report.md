# Báo Cáo Kỹ Thuật: Ứng Dụng Web Mua Sắm Phân Tán

## 1. Giới thiệu
### 1.1 Tổng quan dự án
  - Mục tiêu xây dựng hệ thống web shopping phân tán.
  - Yêu cầu chức năng: tìm kiếm sản phẩm, xem chi tiết
### 1.2 Công nghệ sử dụng
  - **Backend & Frontend:** Express.js
  - **Cơ sở dữ liệu:** MongoDB (cho dữ liệu sản phẩm)
  - **Công cụ tìm kiếm:** Sonic Search Engine (tích hợp qua gRPC)
  - **Giao tiếp:** gRPC (giữa main-app và sonic-server), HTTP (cho client)
  - **Đóng gói & Triển khai:** Docker, Kubernetes
  - **Reverse Proxy & Load Balancer:** Nginx (thông qua Kubernetes Ingress Nginx Controller)
  - **Hạ tầng:** Google Cloud Engine (GCE) - được quản lý bởi Terraform

## 2. Kiến trúc hệ thống
### 2.1 Tổng quan kiến trúc
  - Mô hình microservices với hai thành phần chính: `main-app` và `sonic-server`.
  - Kiến trúc có thể xem như 3-tier:
    - **Presentation Tier:** `main-app` phục vụ giao diện người dùng HTML và API.
    - **Application/Logic Tier:** `main-app` xử lý logic nghiệp vụ, `sonic-server` xử lý logic tìm kiếm.
    - **Data Tier:** MongoDB lưu trữ dữ liệu sản phẩm, Sonic Engine lưu trữ chỉ mục tìm kiếm.
### 2.2 Main App (`main-app`)
  - **Chức năng:**
    - Cung cấp giao diện web tĩnh cho người dùng ([`main-app/public/index.html`](main-app/public/index.html)).
    - Tiếp nhận yêu cầu HTTP từ client (ví dụ: `/search`).
    - Đóng vai trò gRPC client để giao tiếp với `sonic-server` cho các tác vụ tìm kiếm.
  - **Công nghệ:** Express.js, gRPC, Pino (cho logging).
  - **Triển khai:** Dưới dạng Kubernetes Deployment (`main-app-deployment`) với Service (`main-app`)
### 2.3 Sonic Server (`sonic-server`)
  - **Chức năng:**
    - Cung cấp gRPC service ([`sonic_service.proto`](main-app/proto/sonic_service.proto)) cho `main-app` để thực hiện:
      - `SearchAndFetchItems`: Tìm kiếm sản phẩm dựa trên query string và trả về thông tin chi tiết từ MongoDB.
      - `IngestData`: Đọc dữ liệu từ MongoDB và đẩy vào Sonic Engine để tạo/cập nhật chỉ mục tìm kiếm.
      - `GetNodeStatus`: Cung cấp thông tin trạng thái của node.
    - Tích hợp và quản lý Sonic Search Engine (child process).
    - Kết nối với MongoDB để truy xuất và đồng bộ dữ liệu sản phẩm.
  - **Công nghệ:** Node.js, gRPC, `sonic-channel` library, Mongoose (cho MongoDB).
  - **Triển khai:** Dưới dạng Kubernetes Deployment (`sonic-server-deployment`) với Service (`sonic-server`). Mỗi pod `sonic-server` sẽ chạy cả Node.js application và Sonic engine.
### 2.4 Hạ tầng Kubernetes
  - **Orchestration:** Quản lý life cycle và networking của các container `main-app` và `sonic-server`.
  - **Networking:**
    - `Service` (ClusterIP) cho giao tiếp nội bộ giữa `main-app` và `sonic-server`.
    - `Ingress` (`ingress-nginx`) để expose `main-app` ra bên ngoài thông qua domain `shop.nielnart.io.vn`.
  - **Configuration:**
    - `ConfigMap` (`sonic-server-config`) để quản lý cấu hình của Sonic Engine ([`sonic-server/sonic.cfg`](../sonic-server/sonic.cfg)).
    - `Secrets` (ví dụ: `sonic-server-secret` cho `MONGO_URI` và `SONIC_AUTH`).

## 3. Đáp ứng các yêu cầu bắt buộc
### 3.1 Khả năng chịu lỗi (Fault Tolerance)
  - **Kubernetes Pod Management:**
    - `main-app-deployment` và `sonic-server-deployment` được cấu hình với `replicas: 2` (cho `sonic-server`) và `replicas: 2` (cho `main-app`), đảm bảo có nhiều instance chạy đồng thời.
    - Kubernetes tự động khởi động lại các pod bị lỗi.
  - **gRPC Connection (trong `main-app`):**
    - Logic `connectToSonicWithRetry` trong [`main-app/index.js`](main-app/index.js:166) thực hiện kết nối lại với `sonic-server` theo cơ chế `exponential backoff` nếu kết nối ban đầu thất bại hoặc bị gián đoạn.
  - **Sonic Server:**
    - `sonic-server` khởi chạy Sonic engine như một child process và có logic để theo dõi. Nếu Sonic engine gặp sự cố, `sonic-server` có thể ghi log và báo cáo status

### 3.2 Giao tiếp phân tán
  - **gRPC (Giao tiếp nội bộ):**
    - `main-app` giao tiếp với `sonic-server` qua gRPC (port `50051`).
    - Định nghĩa service và message được thực hiện qua file `.proto` ([`main-app/proto/sonic_service.proto`](main-app/proto/sonic_service.proto) và [`sonic-server/proto/sonic_service.proto`](sonic-server/proto/sonic_service.proto)).
    - Kubernetes Service (`sonic-server`) đóng vai trò service discovery cho gRPC endpoint.
  - **HTTP (Giao tiếp bên ngoài):**
    - Client (trình duyệt) giao tiếp với `main-app` qua HTTP (port `80` của service, target port `3030` của container).
    - [`kubernetes/ingress.yaml`](kubernetes/ingress.yaml:1) định nghĩa cách Ingress Nginx Controller expose `main-app` service ra internet tại `shop.nielnart.io.vn`.

### 3.3 Phân mảnh hoặc Sao chép dữ liệu (Sharding or Replication)
  - **Application-Level Replication (cho `main-app` và `sonic-server`):**
    - `sonic-server` đều được triển khai với nhiều replicas trên Kubernetes, mỗi pod sẽ có một instance của Sonic engine và lưu trữ data trên trong pod đó(dữ liệu này sẽ tồn tại nếu pod không bị xóa).
  - **Data Replication/Consistency (MongoDB):**
    - (Chưa triển khai)
  - **Search Index Replication (Sonic):**
    - Mỗi pod `sonic-server` chạy một instance Sonic engine riêng. Dữ liệu được ingest vào Sonic từ MongoDB.
    - Sonic không hỗ trợ sharding dữ liệu tự động qua nhiều node hay replicas.

### 3.4 Giám sát / Ghi log đơn giản (Simple Monitoring / Logging)
  - **Application Logging:**
    - Cả `main-app` và `sonic-server` sử dụng `pino` logger để ghi log có cấu trúc (xem [`main-app/index.js`](main-app/index.js:10) và [`sonic-server/index.js`](sonic-server/index.js:9)).
    - Log level được cấu hình và có thể phân biệt giữa môi trường development và production.
    - Log bao gồm thông tin về request, gRPC calls, lỗi, và trạng thái kết nối.
  - **Kubernetes Monitoring:**
    - `kubectl logs <pod-name>` để xem log của từng pod.
    - `kubectl describe pod <pod-name>` để xem events và trạng thái của pod.
    - Kubernetes Dashboard(có thể thông qua port-forward), Kubernetes (Prometheus, Grafana) - Chưa được tích hợp.

### 3.5 Kiểm tra Stress Test
  - **Implementation:**
    - Script [`main-app/stress-test.js`](main-app/stress-test.js:1) được sử dụng để thực hiện stress test.
    - Script gửi `NUM_REQUESTS` (5000) yêu cầu HTTP GET đến endpoint `/search` của `main-app` với `CONCURRENCY_LIMIT` (5000).
    - Các search terms được chọn ngẫu nhiên từ một danh sách định sẵn.
  - **Observation & Metrics:**
    - Script theo dõi số lượng request thành công và thất bại.
    - Kết quả được in ra console sau khi test hoàn thành.
    - Mục tiêu là quan sát hành vi của hệ thống (CPU/memory usage của pods, response time) khi có nhiều request đồng thời.

## 4. Các yêu cầu tùy chọn
### 4.1 Cân bằng tải (Load Balancing)
  - **External Load Balancing (Nginx Ingress):**
    - [`kubernetes/ingress.yaml`](kubernetes/ingress.yaml:1) sử dụng Nginx Ingress controller.
    - default dùng Round Robin để cân bằng tải các request đến `main-app` service.
  - **Internal Load Balancing (Kubernetes Service):**
    - Kubernetes Service (`main-app` và `sonic-server`) tự động cân bằng tải các request nội bộ (ví dụ, từ `main-app` đến `sonic-server`) giữa các pod backend theo thuật toán round-robin (mặc định).

### 4.2 Tự động hóa triển khai (Deployment Automation)
  - **Containerization (Docker):**
    - Cả `main-app` và `sonic-server` đều có `Dockerfile` ([`main-app/Dockerfile`](main-app/Dockerfile:1), [`sonic-server/Dockerfile`](sonic-server/Dockerfile:1)) để đóng gói ứng dụng thành Docker image.
    - Các image được đẩy lên Docker Hub (ví dụ: `nieltran/main-app:v1.0`).
  - **Orchestration (Kubernetes):**
    - Toàn bộ hệ thống được định nghĩa bằng các file YAML trong thư mục [`kubernetes/`](kubernetes/) (Deployments, Services, Ingress, ConfigMap, HPA, PDB).
    - `kubectl apply -f <directory>` có thể được sử dụng để triển khai hoặc cập nhật toàn bộ hệ thống.
    - [`deploy.sh`](deploy.sh:1) có thể là script để tự động hóa quá trình này.
  - **Infrastructure as Code (Terraform):**
    - Thư mục [`terraform/`](terraform/) cho thấy Terraform được sử dụng để quản lý hạ tầng (ví dụ: máy ảo GCE, network). Điều này giúp tự động hóa việc tạo và quản lý môi trường chạy Kubernetes.

## 5. Giải thích chi tiết về cách hệ thống hoạt động
### 5.1 Luồng yêu cầu người dùng (User Request Flow - Tìm kiếm)
  1. Người dùng nhập từ khóa tìm kiếm vào giao diện web trên trình duyệt.
  2. Trình duyệt gửi HTTP GET request đến `http://shop.nielnart.io.vn/search?q=<từ-khóa>`.
  3. Ingress Nginx controller nhận request, dựa vào host và path, route request đến `main-app` service.
  4. `main-app` service cân bằng tải request đến một trong các `main-app` pod.
  5. `main-app` pod (Express.js) nhận request, trích xuất query string.
  6. `main-app` pod (gRPC client) gửi gRPC request `SearchAndFetchItems` đến `sonic-server` service.
  7. `sonic-server` service cân bằng tải request đến một trong các `sonic-server` pod.
  8. `sonic-server` pod (gRPC server) nhận request:
     a. Query Sonic engine (chạy trong cùng pod) để lấy danh sách ID sản phẩm khớp với từ khóa.
     b. Dùng các ID này để query MongoDB lấy thông tin chi tiết sản phẩm.
     c. Trả về danh sách sản phẩm chi tiết cho `main-app` qua gRPC response.
  9. `main-app` pod nhận gRPC response, xử lý và trả về JSON response cho client qua HTTP.
  10. Trình duyệt nhận JSON response và hiển thị kết quả tìm kiếm.

### 6.1 Điểm mạnh của hệ thống
  - **Khả năng chịu lỗi (Resilience):** Kubernetes quản lý pod lifecycle, đảm bảo các service luôn chạy. Logic retry trong `main-app` tăng cường khả năng phục hồi.
  - **Tự động hóa triển khai (Deployment Automation):** Docker, Kubernetes YAML, và Terraform giúp quá trình triển khai và quản lý hạ tầng được tự động hóa.
  - **Tìm kiếm hiệu quả (Efficient Search):** Sonic cung cấp khả năng tìm kiếm nhanh và nhẹ.
