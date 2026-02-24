-- v3_scores_v2에 wiki_entries FK 추가 (PostgREST join 지원)
ALTER TABLE public.v3_scores_v2
  ADD CONSTRAINT v3_scores_v2_wiki_entry_id_fkey
  FOREIGN KEY (wiki_entry_id) REFERENCES public.wiki_entries(id);

-- v3_energy_snapshots_v2에도 FK 추가
ALTER TABLE public.v3_energy_snapshots_v2
  ADD CONSTRAINT v3_energy_snapshots_v2_wiki_entry_id_fkey
  FOREIGN KEY (wiki_entry_id) REFERENCES public.wiki_entries(id);

-- v3_energy_baselines_v2에도 FK 추가
ALTER TABLE public.v3_energy_baselines_v2
  ADD CONSTRAINT v3_energy_baselines_v2_wiki_entry_id_fkey
  FOREIGN KEY (wiki_entry_id) REFERENCES public.wiki_entries(id);