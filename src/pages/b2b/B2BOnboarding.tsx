import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, ShoppingBag, ArrowRight, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

type OrgType = 'entertainment' | 'brand';

const B2BOnboarding = () => {
  const [step, setStep] = useState<'type' | 'info'>('type');
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !orgType) return;
    setLoading(true);
    try {
      const { data: org, error: orgErr } = await (supabase as any)
        .from('ktrenz_b2b_organizations')
        .insert({ name: orgName, org_type: orgType, industry: orgType === 'brand' ? industry : null })
        .select('id')
        .single();
      if (orgErr) throw orgErr;

      const { error: memErr } = await (supabase as any)
        .from('ktrenz_b2b_members')
        .insert({ user_id: user.id, org_id: org.id, role: 'owner', job_title: jobTitle || null });
      if (memErr) throw memErr;

      toast({ title: '워크스페이스 생성 완료!', description: '대시보드를 설정하고 있습니다...' });
      navigate('/b2b');
    } catch (err: any) {
      toast({ title: '오류', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const typeCards: { type: OrgType; icon: React.ReactNode; title: string; desc: string }[] = [
    {
      type: 'entertainment',
      icon: <Building2 className="w-8 h-8" />,
      title: '엔터테인먼트 기업',
      desc: '아티스트를 관리하고 트렌드 성과, 시장 가치, 브랜드 협업 기회를 추적합니다.',
    },
    {
      type: 'brand',
      icon: <ShoppingBag className="w-8 h-8" />,
      title: '브랜드 / 에이전시',
      desc: '마케팅 캠페인에 스타 파워를 활용하고 경쟁사 캠페인을 벤치마킹합니다.',
    },
  ];

  return (
    <div className="min-h-screen bg-[hsl(220,20%,8%)] flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* 진행 표시 */}
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === 'type' ? 'bg-[hsl(270,80%,55%)] text-white' : 'bg-[hsl(150,60%,40%)] text-white'}`}>
            {step === 'info' ? <Check className="w-4 h-4" /> : '1'}
          </div>
          <div className="flex-1 h-0.5 bg-[hsl(220,15%,20%)]">
            <div className={`h-full bg-[hsl(270,80%,55%)] transition-all ${step === 'info' ? 'w-full' : 'w-0'}`} />
          </div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === 'info' ? 'bg-[hsl(270,80%,55%)] text-white' : 'bg-[hsl(220,15%,20%)] text-[hsl(220,10%,40%)]'}`}>
            2
          </div>
        </div>

        {step === 'type' ? (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">프로필 선택</h1>
              <p className="text-[hsl(220,10%,50%)] mt-1">스타 × 트렌드 인텔리전스 활용 방식을 선택하세요</p>
            </div>
            <div className="space-y-4">
              {typeCards.map(card => (
                <button
                  key={card.type}
                  onClick={() => { setOrgType(card.type); setStep('info'); }}
                  className={`w-full text-left p-6 rounded-xl border transition-all ${
                    orgType === card.type
                      ? 'border-[hsl(270,80%,55%)] bg-[hsl(270,80%,55%,0.1)]'
                      : 'border-[hsl(220,15%,20%)] bg-[hsl(220,15%,12%)] hover:border-[hsl(220,15%,30%)]'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-[hsl(270,80%,60%)]">{card.icon}</div>
                    <div>
                      <p className="text-white font-semibold text-lg">{card.title}</p>
                      <p className="text-[hsl(220,10%,50%)] text-sm mt-1">{card.desc}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-[hsl(220,10%,30%)] mt-1 ml-auto shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateOrg} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">워크스페이스 설정</h1>
              <p className="text-[hsl(220,10%,50%)] mt-1">
                {orgType === 'entertainment' ? '엔터테인먼트 기업 정보를 입력해주세요' : '브랜드 또는 에이전시 정보를 입력해주세요'}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-[hsl(220,10%,60%)] mb-1.5 block">회사명</label>
                <Input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder={orgType === 'entertainment' ? '예: SM엔터테인먼트' : '예: 삼성전자'}
                  className="bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] text-white h-11"
                  required
                />
              </div>
              {orgType === 'brand' && (
                <div>
                  <label className="text-sm text-[hsl(220,10%,60%)] mb-1.5 block">업종</label>
                  <Input
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    placeholder="예: 패션, 식음료, 화장품"
                    className="bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] text-white h-11"
                  />
                </div>
              )}
              <div>
                <label className="text-sm text-[hsl(220,10%,60%)] mb-1.5 block">직함</label>
                <Input
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="예: 마케팅 디렉터"
                  className="bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] text-white h-11"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={() => setStep('type')} className="text-[hsl(220,10%,50%)]">
                이전
              </Button>
              <Button
                type="submit"
                disabled={loading || !orgName}
                className="flex-1 h-11 bg-gradient-to-r from-[hsl(270,80%,55%)] to-[hsl(200,80%,50%)] hover:opacity-90 text-white font-semibold"
              >
                {loading ? '생성 중...' : '워크스페이스 만들기'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default B2BOnboarding;
