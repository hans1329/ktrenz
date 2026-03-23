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
      // Create org
      const { data: org, error: orgErr } = await (supabase as any)
        .from('ktrenz_b2b_organizations')
        .insert({ name: orgName, org_type: orgType, industry: orgType === 'brand' ? industry : null })
        .select('id')
        .single();
      if (orgErr) throw orgErr;

      // Create membership
      const { error: memErr } = await (supabase as any)
        .from('ktrenz_b2b_members')
        .insert({ user_id: user.id, org_id: org.id, role: 'owner', job_title: jobTitle || null });
      if (memErr) throw memErr;

      toast({ title: 'Workspace created!', description: 'Setting up your dashboard...' });
      navigate('/b2b');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const typeCards: { type: OrgType; icon: React.ReactNode; title: string; desc: string }[] = [
    {
      type: 'entertainment',
      icon: <Building2 className="w-8 h-8" />,
      title: 'Entertainment Company',
      desc: 'I manage artists and need to track their trend performance, market value, and brand collaboration opportunities.',
    },
    {
      type: 'brand',
      icon: <ShoppingBag className="w-8 h-8" />,
      title: 'Brand / Agency',
      desc: 'I want to leverage star power for marketing campaigns and benchmark against competitor campaigns.',
    },
  ];

  return (
    <div className="min-h-screen bg-[hsl(220,20%,8%)] flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Progress */}
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
              <h1 className="text-2xl font-bold text-white">Choose Your Profile</h1>
              <p className="text-[hsl(220,10%,50%)] mt-1">Select how you use star × trend intelligence</p>
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
              <h1 className="text-2xl font-bold text-white">Set Up Workspace</h1>
              <p className="text-[hsl(220,10%,50%)] mt-1">
                {orgType === 'entertainment' ? 'Tell us about your entertainment company' : 'Tell us about your brand or agency'}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-[hsl(220,10%,60%)] mb-1.5 block">Company Name</label>
                <Input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder={orgType === 'entertainment' ? 'e.g. SM Entertainment' : 'e.g. Samsung Electronics'}
                  className="bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] text-white h-11"
                  required
                />
              </div>
              {orgType === 'brand' && (
                <div>
                  <label className="text-sm text-[hsl(220,10%,60%)] mb-1.5 block">Industry</label>
                  <Input
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    placeholder="e.g. Fashion, F&B, Cosmetics"
                    className="bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] text-white h-11"
                  />
                </div>
              )}
              <div>
                <label className="text-sm text-[hsl(220,10%,60%)] mb-1.5 block">Your Title</label>
                <Input
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. Marketing Director"
                  className="bg-[hsl(220,15%,12%)] border-[hsl(220,15%,20%)] text-white h-11"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={() => setStep('type')} className="text-[hsl(220,10%,50%)]">
                Back
              </Button>
              <Button
                type="submit"
                disabled={loading || !orgName}
                className="flex-1 h-11 bg-gradient-to-r from-[hsl(270,80%,55%)] to-[hsl(200,80%,50%)] hover:opacity-90 text-white font-semibold"
              >
                {loading ? 'Creating...' : 'Create Workspace'}
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
