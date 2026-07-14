# Define all directories to be created
 $directories = @(
    "backend",
    "backend\alembic",
    "backend\alembic\versions",
    "backend\app",
    "backend\app\core",
    "backend\app\db",
    "backend\app\db\repositories",
    "backend\app\models",
    "backend\app\models\db",
    "backend\app\models\schemas",
    "backend\app\integrations",
    "backend\app\integrations\crm",
    "backend\app\integrations\digihealth",
    "backend\app\integrations\sms",
    "backend\app\routers",
    "backend\app\services",
    "backend\tests",
    "backend\tests\unit",
    "backend\tests\integration"
)

# Define all files to be created
 $files = @(
    "backend\.env.example",
    "backend\alembic.ini",
    "backend\Dockerfile",
    "backend\pyproject.toml",
    "backend\requirements.txt",
    "backend\requirements-dev.txt",
    
    "backend\alembic\env.py",
    "backend\alembic\versions\001_initial_schema.py",
    
    "backend\app\main.py",
    
    "backend\app\core\audit.py",
    "backend\app\core\cache.py",
    "backend\app\core\circuit_breaker.py",
    "backend\app\core\config.py",
    "backend\app\core\exceptions.py",
    "backend\app\core\logging.py",
    "backend\app\core\metrics.py",
    "backend\app\core\security.py",
    
    "backend\app\db\session.py",
    "backend\app\db\repositories\audit_repo.py",
    "backend\app\db\repositories\conversation_repo.py",
    "backend\app\db\repositories\knowledge_repo.py",
    "backend\app\db\repositories\ticket_repo.py",
    "backend\app\db\repositories\user_repo.py",
    
    "backend\app\models\db\base.py",
    "backend\app\models\db\audit_event.py",
    "backend\app\models\db\conversation.py",
    "backend\app\models\db\knowledge_doc.py",
    "backend\app\models\db\ticket.py",
    "backend\app\models\db\user.py",
    
    "backend\app\models\schemas\admin.py",
    "backend\app\models\schemas\conversation.py",
    "backend\app\models\schemas\ticket.py",
    "backend\app\models\schemas\user.py",
    
    "backend\app\integrations\crm\client.py",
    "backend\app\integrations\digihealth\client.py",
    "backend\app\integrations\digihealth\models.py",
    "backend\app\integrations\sms\client.py",
    
    "backend\app\routers\admin_audit.py",
    "backend\app\routers\admin_auth.py",
    "backend\app\routers\admin_conversations.py",
    "backend\app\routers\admin_knowledge.py",
    "backend\app\routers\admin_stats.py",
    "backend\app\routers\admin_tickets.py",
    "backend\app\routers\admin_users.py",
    "backend\app\routers\chat.py",
    "backend\app\routers\dependencies.py",
    "backend\app\routers\health.py",
    "backend\app\routers\metrics_endpoint.py",
    
    "backend\app\services\auth_service.py",
    "backend\app\services\llm_service.py",
    "backend\app\services\orchestrator.py",
    "backend\app\services\rag_service.py",
    "backend\app\services\sentiment_service.py",
    "backend\app\services\summarizer.py",
    
    "backend\tests\conftest.py",
    "backend\tests\unit\test_circuit_breaker.py",
    "backend\tests\unit\test_orchestrator_states.py",
    "backend\tests\unit\test_security.py",
    "backend\tests\integration\test_admin_auth.py",
    "backend\tests\integration\test_health.py"
)

Write-Host "Starting creation of backend structure..." -ForegroundColor Green

# Create directories
foreach ($dir in $directories) {
    # -Force ensures it doesn't throw an error if the folder already exists
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Write-Host "Created directory: $dir"
}

# Create empty files
foreach ($file in $files) {
    # -Force creates the file without throwing an error if it already exists
    New-Item -ItemType File -Force -Path $file | Out-Null
    Write-Host "Created file: $file"
}

Write-Host "----------------------------------------" -ForegroundColor Green
Write-Host "Backend folder and all files created successfully!" -ForegroundColor Green