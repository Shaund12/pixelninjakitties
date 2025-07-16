# Provider Preferences Table Setup

For the new Supabase-based storage system, you need to create a `provider_preferences` table in your Supabase project.

## SQL to Create the Table

```sql
-- Create the provider_preferences table
CREATE TABLE provider_preferences (
    id TEXT PRIMARY KEY DEFAULT 'default',
    preferences JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_provider_preferences_updated_at 
    BEFORE UPDATE ON provider_preferences 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
```

## Table Structure

- `id`: Primary key (always 'default' for single-row storage)
- `preferences`: JSONB column containing all provider preferences
- `created_at`: Timestamp when the record was created
- `updated_at`: Timestamp when the record was last updated

## Data Format

The preferences column stores data in this format:

```json
{
  "1": {
    "provider": "dall-e",
    "timestamp": 1752299590237,
    "options": {
      "model": "dall-e-3",
      "quality": "hd",
      "style": "vivid"
    }
  },
  "2": {
    "provider": "stability",
    "timestamp": 1752299590237,
    "options": {
      "stylePreset": "anime"
    }
  }
}
```

Where each key is a token ID and the value contains the provider preference for that token.