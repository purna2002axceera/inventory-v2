'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Lock, Copy, CheckCircle2 } from 'lucide-react';

export function LicenseGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [activated, setActivated] = useState(false);
  const [hwid, setHwid] = useState('');
  
  const [key, setKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function checkLicense() {
      try {
        const res = await window.electronAPI.license.status();
        setActivated(res.activated);
        setHwid(res.hwid);
      } catch (err) {
        console.error('Failed to check license:', err);
      } finally {
        setChecking(false);
      }
    }
    checkLicense();
  }, []);

  async function handleActivate() {
    if (!key) return;
    setActivating(true);
    try {
      const res = await window.electronAPI.license.activate(key);
      if (res.success) {
        setActivated(true);
        toast.success('Software successfully activated!');
      } else {
        toast.error(res.error || 'Invalid license key.');
      }
    } catch (err) {
      toast.error('Activation failed. Please try again.');
    } finally {
      setActivating(false);
    }
  }

  function copyHwid() {
    navigator.clipboard.writeText(hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (checking) return null; // Don't flash screen while checking

  if (activated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg border-2 border-primary/20">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-2">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Software Activation</CardTitle>
          <CardDescription className="text-base">
            This installation is not yet activated for this computer. Please provide your Machine ID to the developer to receive an activation key.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Your Machine ID</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted p-3 rounded-md text-lg font-mono text-center border">
                {hwid || 'LOADING...'}
              </code>
              <Button size="icon" variant="outline" className="h-12 w-12 shrink-0" onClick={copyHwid}>
                {copied ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t">
            <label className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">License Key</label>
            <Input 
              placeholder="LIC-XXXX-XXXX-XXXX-XXXX" 
              className="font-mono text-center text-lg h-12 uppercase" 
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
            />
          </div>
        </CardContent>

        <CardFooter>
          <Button 
            className="w-full h-12 text-lg" 
            size="lg" 
            onClick={handleActivate} 
            disabled={activating || !key || key.length < 16}
          >
            {activating ? 'Verifying...' : 'Activate Software'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
