
-- B2B 조직 프로필 테이블
CREATE TABLE public.ktrenz_b2b_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_type text NOT NULL CHECK (org_type IN ('entertainment', 'brand')),
  domain text,
  logo_url text,
  industry text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- B2B 멤버 테이블
CREATE TABLE public.ktrenz_b2b_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.ktrenz_b2b_organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  job_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- B2B 조직이 추적하는 아티스트
CREATE TABLE public.ktrenz_b2b_tracked_stars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.ktrenz_b2b_organizations(id) ON DELETE CASCADE,
  star_id uuid NOT NULL REFERENCES public.ktrenz_stars(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'owned' CHECK (relationship IN ('owned', 'competitor', 'prospect', 'partner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, star_id)
);

-- B2B AI 인사이트 캐시
CREATE TABLE public.ktrenz_b2b_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.ktrenz_b2b_organizations(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  star_id uuid REFERENCES public.ktrenz_stars(id),
  trigger_id uuid,
  content jsonb NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

-- RLS
ALTER TABLE public.ktrenz_b2b_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_b2b_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_b2b_tracked_stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_b2b_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own org" ON public.ktrenz_b2b_organizations FOR SELECT TO authenticated USING (id IN (SELECT org_id FROM public.ktrenz_b2b_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can view own membership" ON public.ktrenz_b2b_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Members can view tracked stars" ON public.ktrenz_b2b_tracked_stars FOR SELECT TO authenticated USING (org_id IN (SELECT org_id FROM public.ktrenz_b2b_members WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage tracked stars" ON public.ktrenz_b2b_tracked_stars FOR ALL TO authenticated USING (org_id IN (SELECT org_id FROM public.ktrenz_b2b_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));
CREATE POLICY "Members can view insights" ON public.ktrenz_b2b_ai_insights FOR SELECT TO authenticated USING (org_id IN (SELECT org_id FROM public.ktrenz_b2b_members WHERE user_id = auth.uid()));
CREATE POLICY "Authenticated can create orgs" ON public.ktrenz_b2b_organizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can create membership" ON public.ktrenz_b2b_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_b2b_members_user ON public.ktrenz_b2b_members(user_id);
CREATE INDEX idx_b2b_members_org ON public.ktrenz_b2b_members(org_id);
CREATE INDEX idx_b2b_tracked_stars_org ON public.ktrenz_b2b_tracked_stars(org_id);
CREATE INDEX idx_b2b_insights_org ON public.ktrenz_b2b_ai_insights(org_id);
