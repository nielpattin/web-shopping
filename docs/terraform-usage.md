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
# Get the public IPs of the instances
terraform output --json public_ips

# Example output:
["35.215.121.124","35.215.124.212","35.215.176.251"]
# SSH into the instance
ssh <your_username>@<public_ip>