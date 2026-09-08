'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { Cloud, CheckCircle2, XCircle, Moon, Sun, Monitor } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';

function SettingsPageContent() {
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await window.electronAPI.drive.status();
      setIsConnected(res.connected);
    } catch (e) {
      console.error(e);
    } finally {
      setIsChecking(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await window.electronAPI.drive.connect();
      if (res && res.success) {
        toast.success("Successfully connected to Google Drive!");
        setIsConnected(true);
      } else {
        toast.error(res?.error || "Failed to connect.");
      }
    } catch (e: any) {
      toast.error(e.message || "An error occurred.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.drive.disconnect();
      setIsConnected(false);
      toast.success("Disconnected from Google Drive.");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    toast.info("Starting backup... Please wait.");
    try {
      const res = await window.electronAPI.drive.backup();
      if (res && res.success) {
        toast.success("Backup successful!");
      } else {
        toast.error(res?.error || "Backup failed.");
      }
    } catch (e: any) {
      toast.error(e.message || "An error occurred during backup.");
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-2">
          Manage application settings and integrations.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-blue-500" />
              <CardTitle>Google Drive Backup</CardTitle>
            </div>
            <CardDescription>
              Connect your Google Drive account to enable automatic and manual backups.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                {isChecking ? (
                  <span className="text-sm text-muted-foreground">Checking status...</span>
                ) : isConnected ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-medium">Connected</p>
                      <p className="text-sm text-muted-foreground">Automatic backups are active (Every 6h & on exit).</p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Not Connected</p>
                      <p className="text-sm text-muted-foreground">Connect to enable cloud backups.</p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {!isConnected ? (
                  <>
                    <Button onClick={handleConnect} disabled={isConnecting || isChecking}>
                      {isConnecting ? "Connecting..." : "Connect"}
                    </Button>
                    {isConnecting && (
                      <Button variant="ghost" onClick={() => setIsConnecting(false)}>
                        Cancel
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={handleDisconnect}>
                      Disconnect
                    </Button>
                    <Button onClick={handleBackup} disabled={isBackingUp}>
                      {isBackingUp ? "Backing up..." : "Backup Now"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Moon className="w-5 h-5 text-indigo-500" />
              <CardTitle>Appearance</CardTitle>
            </div>
            <CardDescription>
              Customize the look and feel of the application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
              <div className="space-y-1">
                <p className="font-medium">Theme Preference</p>
                <p className="text-sm text-muted-foreground">Select your preferred theme.</p>
              </div>
              {mounted && (
                <div className="flex bg-muted p-1 rounded-lg gap-1">
                  <Button
                    variant={theme === 'light' ? 'default' : 'ghost'}
                    size="sm"
                    className="gap-2"
                    onClick={() => setTheme('light')}
                  >
                    <Sun className="w-4 h-4" /> Light
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'ghost'}
                    size="sm"
                    className="gap-2"
                    onClick={() => setTheme('dark')}
                  >
                    <Moon className="w-4 h-4" /> Dark
                  </Button>
                  <Button
                    variant={theme === 'system' ? 'default' : 'ghost'}
                    size="sm"
                    className="gap-2"
                    onClick={() => setTheme('system')}
                  >
                    <Monitor className="w-4 h-4" /> System
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <SettingsPageContent />
      </AppShell>
    </RequireAuth>
  );
}
