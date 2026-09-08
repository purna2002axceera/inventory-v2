'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { callIpc } from '@/lib/ipc-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Package, AlertCircle, ShoppingCart } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Metrics = {
  summary: { totalRevenue: number; totalOrders: number; totalReturns: number; lowStockCount: number; };
  salesByMonth: { month: string; revenue: number; quantity: number }[];
  topSellingItems: { name: string; sku: string; quantity: number; revenue: number }[];
  mostReturnedItems: { name: string; sku: string; quantity: number }[];
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function DashboardContent() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all');

  useEffect(() => {
    setLoading(true);
    callIpc(window.electronAPI.dashboard.getMetrics({ timeRange }))
      .then(setMetrics)
      .finally(() => setLoading(false));
  }, [timeRange]);

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.fullName ?? user?.username}</p>
        </div>
        <div className="w-48">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger>
              <SelectValue placeholder="Select Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && !metrics ? (
        <div className="text-center py-20 text-muted-foreground animate-pulse">Loading vibrant dashboard metrics...</div>
      ) : !metrics ? (
        <div className="text-center py-20 text-destructive">Failed to load metrics.</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="hover:shadow-lg transition-all duration-300 border-none bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-blue-100">Total Revenue</CardTitle>
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <DollarSign className="w-4 h-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight">
                  LKR {metrics.summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300 border-none bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-emerald-100">Sales Orders</CardTitle>
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <ShoppingCart className="w-4 h-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight">{metrics.summary.totalOrders}</div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300 border-none bg-gradient-to-br from-rose-400 to-red-500 text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-rose-100">Low Stock Items</CardTitle>
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <AlertCircle className="w-4 h-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight">{metrics.summary.lowStockCount}</div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300 border-none bg-gradient-to-br from-amber-400 to-orange-500 text-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-amber-100">Items Returned</CardTitle>
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Package className="w-4 h-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight">{metrics.summary.totalReturns}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            {/* Sales Line Chart */}
            <Card className="col-span-4 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>Sales Revenue</CardTitle>
                <CardDescription>Revenue trend for completed sales</CardDescription>
              </CardHeader>
              <CardContent className="pl-0">
                {metrics.salesByMonth.length === 0 ? (
                  <div className="flex h-[350px] items-center justify-center text-muted-foreground">
                    No sales data available.
                  </div>
                ) : (
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics.salesByMonth} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val / 1000}k`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--popover-foreground)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }}
                        />
                        <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8, stroke: '#3b82f6', strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Selling Items Bar Chart */}
            <Card className="col-span-3 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>Top Selling Items</CardTitle>
                <CardDescription>By total quantity sold</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.topSellingItems.length === 0 ? (
                  <div className="flex h-[350px] items-center justify-center text-muted-foreground">
                    No sales data available.
                  </div>
                ) : (
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.topSellingItems} layout="vertical" margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                        <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={110} tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#fff', borderColor: 'var(--border)', borderRadius: '8px', color: '#000', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ color: '#000', fontWeight: 'bold' }}
                          cursor={false}
                        />
                        <Bar dataKey="quantity" name="Quantity Sold" fill="#10b981" radius={[0, 6, 6, 0]} barSize={28}>
                          {metrics.topSellingItems.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'][index % 5]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Most Returned Items Pie Chart */}
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>Most Returned Items</CardTitle>
                <CardDescription>Items with the highest return frequency</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.mostReturnedItems.length === 0 ? (
                  <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                    No returns recorded yet.
                  </div>
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metrics.mostReturnedItems}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={5}
                          dataKey="quantity"
                          nameKey="name"
                          stroke="none"
                        >
                          {metrics.mostReturnedItems.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--popover-foreground)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <AppShell>
        <DashboardContent />
      </AppShell>
    </RequireAuth>
  );
}
