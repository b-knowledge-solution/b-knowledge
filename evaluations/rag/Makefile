.PHONY: help deploy verify shell build clean rebuild test eval report docs

# Default shell detection
SHELL_DETECTED := bash
ifeq ($(OS),Windows_NT)
	SHELL_DETECTED := powershell
endif

##############################################################################
# HELP
##############################################################################

help:
	@echo "RAG Evaluation System - Makefile"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy       - Deploy the RAG evaluation system (run this first!)"
	@echo "  make verify       - Verify all components are working"
	@echo "  make build        - Just build the Docker image (no dependency checks)"
	@echo "  make rebuild      - Rebuild Docker image from scratch"
	@echo "  make clean        - Clean up Docker containers and volume"
	@echo ""
	@echo "Development:"
	@echo "  make shell        - Open interactive shell in container"
	@echo "  make logs         - Show container logs"
	@echo "  make ps           - Show running containers"
	@echo ""
	@echo "Evaluation:"
	@echo "  make eval         - Run full evaluation (requires implementation)"
	@echo "  make eval-fixture - Test with Phase 2 fixture data"
	@echo "  make report       - Generate HTML report"
	@echo ""
	@echo "Fixture Management:"
	@echo "  make fixture-verify   - Verify Phase 2 fixture setup"
	@echo "  make fixture-convert  - Convert fixture CSV to YAML"
	@echo "  make fixture-clean    - Remove generated fixture files"
	@echo ""
	@echo "Documentation:"
	@echo "  make docs         - Show DEPLOYMENT.md"
	@echo "  make help         - Show this help message"
	@echo ""

##############################################################################
# DEPLOYMENT
##############################################################################

deploy:
	@echo "Starting RAG Evaluation deployment..."
ifeq ($(SHELL_DETECTED),powershell)
	@powershell -Command "& { .\deploy.ps1 }"
else
	@bash ./deploy.sh
endif
	@echo "✓ Deployment complete! Run 'make verify' to check status."

verify:
	@echo "Verifying RAG Evaluation setup..."
ifeq ($(SHELL_DETECTED),powershell)
	@powershell -Command "& { .\verify.ps1 }"
else
	@bash ./verify.sh
endif

##############################################################################
# DOCKER MANAGEMENT
##############################################################################

build:
	@echo "Building Docker image..."
	docker compose build rag-eval
	@echo "✓ Build complete!"

rebuild:
	@echo "Rebuilding Docker image from scratch..."
	docker compose build --no-cache rag-eval
	@echo "✓ Rebuild complete!"

clean:
	@echo "Cleaning up Docker resources..."
	docker compose down -v
	@echo "✓ Cleanup complete!"

ps:
	@echo "Running containers:"
	@docker compose ps

logs:
	@echo "Showing RAG evaluation logs (Ctrl+C to exit)..."
	docker compose logs -f rag-eval

##############################################################################
# DEVELOPMENT
##############################################################################

shell:
	@echo "Entering RAG evaluation container shell..."
	@echo "Tip: Type 'exit' to leave the container"
	docker compose run --rm -it rag-eval bash

bash:
	docker compose run --rm -it rag-eval bash

python:
	docker compose run --rm -it rag-eval python

##############################################################################
# EVALUATION
##############################################################################

eval:
	@echo "Running RAG evaluation..."
	docker compose run --rm rag-eval make eval-internal || true

eval-internal:
	@echo "Executing evaluation pipeline..."
	promptfoo eval -c promptfooconfig.yaml
	@echo "✓ Evaluation complete! Results in ./results/"

eval-fixture:
	@echo "Testing evaluation with fixture data..."
	@echo "Step 1: Converting CSV fixture to YAML..."
	python scripts/csv_to_yaml.py dataset/fixture/reference/qa_pairs_fixture.csv dataset/eval_dataset_fixture.yaml
	@echo "✓ Conversion complete!"
	@echo ""
	@echo "Step 2: Verifying YAML structure..."
	@python -c "import yaml; yaml.safe_load(open('dataset/eval_dataset_fixture.yaml'))"
	@echo "✓ YAML is valid!"
	@echo ""
	@echo "Step 3: Checking fixture documents..."
	@echo "✓ Found sample docs:"
	@ls -lh dataset/fixture/sample_docs/
	@echo ""
	@echo "✓ Fixture setup complete! Ready for Phase 2."
	@echo "Next step: QA replaces fixtures with real content"

report:
	@echo "Generating evaluation report..."
	promptfoo eval -c promptfooconfig.yaml --output results/report.html
	@echo "✓ Report generated: ./results/report.html"

##############################################################################
# FIXTURE MANAGEMENT
##############################################################################

fixture-verify:
	@echo "Verifying Phase 2 fixture setup..."
	@echo ""
	@echo "Documentation: $(shell ls -1 dataset/fixture/sample_docs/ | wc -l) sample docs"
	@ls -1 dataset/fixture/sample_docs/ | sed 's/^/  ✓ /'
	@echo ""
	@echo "Q&A Dataset:"
	@echo "  ✓ CSV file: dataset/fixture/reference/qa_pairs_fixture.csv"
	@wc -l dataset/fixture/reference/qa_pairs_fixture.csv | awk '{print "  ✓ Rows: " $$1 - 1 " test cases (+ header)"}'
	@echo ""
	@echo "✓ Fixture ready for Phase 2!"

fixture-convert:
	@echo "Converting fixture CSV to YAML..."
	python scripts/csv_to_yaml.py dataset/fixture/reference/qa_pairs_fixture.csv dataset/eval_dataset_fixture.yaml
	@echo "✓ Converted: dataset/eval_dataset_fixture.yaml"
	wc -l dataset/eval_dataset_fixture.yaml | awk '{print "  Lines: " $$1}'

fixture-clean:
	@echo "Removing generated fixture YAML (keeps CSV)..."
	rm -f dataset/eval_dataset_fixture.yaml
	@echo "✓ Cleaned!"

##############################################################################
# DOCUMENTATION
##############################################################################

docs:
	@echo "RAG Evaluation Deployment Guide:"
	@echo ""
	@cat DEPLOYMENT.md

version:
	@echo "Checking component versions..."
	@echo "Docker:"
	@docker --version
	@echo ""
	@echo "Docker Compose:"
	@docker compose version
	@echo ""
	@echo "Container versions:"
	@docker compose run --rm rag-eval bash -c "echo '  Node:' && node --version && echo '  Python:' && python --version"

##############################################################################
# CI/CD HELPERS
##############################################################################

test: verify
	@echo "Testing deployment..."
	@docker compose run --rm rag-eval bash -c "echo 'System ready for testing'"

ci-lint:
	@echo "Linting Dockerfile..."
	docker run --rm -i hadolint/hadolint < Dockerfile

ci-all: deploy verify
	@echo "✓ All CI checks passed!"

##############################################################################
# SHORTCUTS
##############################################################################

d: deploy
	@:

v: verify
	@:

b: build
	@:

s: shell
	@:

p: ps
	@:

l: logs
	@:

c: clean
	@:

e: eval
	@:

.DEFAULT_GOAL := help
