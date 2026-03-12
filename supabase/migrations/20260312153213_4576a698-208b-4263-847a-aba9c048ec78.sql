-- Add unique constraint for upsert deduplication on data quality issues
ALTER TABLE public.ktrenz_data_quality_issues 
ADD CONSTRAINT ktrenz_data_quality_issues_wiki_type_platform_key 
UNIQUE (wiki_entry_id, issue_type, platform);