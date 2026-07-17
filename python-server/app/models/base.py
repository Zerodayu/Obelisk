from sqlalchemy.orm import registry

# Declarative mapping registry
mapper_registry = registry()
Base = mapper_registry.generate_base()

# place for shared mixins later

