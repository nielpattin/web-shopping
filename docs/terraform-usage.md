## Terraform Usage

### Terraform Startup

```bash
terraform init # Initialize the Terraform configuration

terraform plan # Review the plan to see what resources will be created

terraform apply # Apply the configuration to create the resources
```
### Terraform Destroy

```bash
terraform destroy # Destroy the resources created by Terraform
```
### Terraform Format

```bash
terraform fmt
```
### Terraform Validate

```bash
terraform validate
```

### SSH Access

```bash
# Get the internal IP, external IP, nginx external IP
terraform output

# SSH into the instance
# (that you already setup the ssh config to use your private key)
ssh <your_username>@<public_ip>
```