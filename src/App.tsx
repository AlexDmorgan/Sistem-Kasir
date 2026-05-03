import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  setDoc,
  doc,
  getDocFromServer,
  deleteDoc,
  updateDoc,
  getDocs,
  orderBy
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Banknote,
  UtensilsCrossed,
  Coffee,
  Cookie,
  Settings as SettingsIcon,
  ChefHat,
  LayoutGrid,
  Drumstick,
  Package,
  Printer,
  ChevronRight,
  LogOut,
  X,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Upload
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

import { db, auth } from './lib/firebase';
import { cn, formatCurrency } from './lib/utils';

import * as XLSX from 'xlsx';

// Types
interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl?: string;
  description?: string;
}

interface CartItem extends MenuItem {
  quantity: number;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<any>({
    displayName: 'Kasir Kita',
    photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    email: 'admin@kasirkita.com'
  });
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'QRIS' | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(true);
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const [managementTab, setManagementTab] = useState<'Menu' | 'Transaksi'>('Menu');
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [isEnteringCash, setIsEnteringCash] = useState(false);

  // Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Menu Listener
  useEffect(() => {
    const q = query(collection(db, 'menu'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setMenu(items);

      // Seed initial data if empty
      if (items.length === 0) {
        seedInitialMenu();
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'menu'));

    return () => unsubscribe();
  }, []);

  const seedInitialMenu = async () => {
    const initialItems = [
      { name: 'Nasi Goreng Spesial', price: 25000, category: 'Makanan utama' },
      { name: 'Mie Ayam Bakso', price: 20000, category: 'Makanan utama' },
      { name: 'Ayam Goreng Serundeng', price: 18000, category: 'Lauk' },
      { name: 'Sate Ayam (5 tusuk)', price: 15000, category: 'Lauk' },
      { name: 'Es Teh Manis', price: 5000, category: 'Minuman' },
      { name: 'Kopi Susu Gula Aren', price: 15000, category: 'Minuman' },
      { name: 'Kerupuk Udang', price: 3000, category: 'Lainnya' },
      { name: 'Sambal Korek Extra', price: 2000, category: 'Lainnya' },
    ];

    for (const item of initialItems) {
      await addDoc(collection(db, 'menu'), item);
    }
  };

  const handleLogin = () => {};
  const handleLogout = () => {
    // Just reset states if needed, but for now we keep the session
    alert("Fitur logout dinonaktifkan dalam mode tanpa login.");
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const exportToExcel = async () => {
    try {
      const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => {
        const d = doc.data();
        return {
          'Order ID': doc.id,
          'Waktu': d.createdAt?.toDate() ? format(d.createdAt.toDate(), 'yyyy-MM-dd HH:mm:ss') : '-',
          'Metode': d.paymentMethod,
          'Total': d.total,
          'Diterima': d.cashReceived || d.total,
          'Kembalian': d.change || 0,
          'Items': d.items.map((i: any) => `${i.name} (${i.quantity})`).join(', ')
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Penjualan");
      XLSX.writeFile(workbook, `Laporan_Penjualan_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("Gagal mengekspor data");
    }
  };

  const saveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editingItem.name || editingItem.price === undefined) {
      alert("Nama and harga harus diisi!");
      return;
    }
    
    try {
      const menuData = {
        name: editingItem.name,
        price: Number(editingItem.price),
        category: editingItem.category || 'Lainnya',
        imageUrl: editingItem.imageUrl || '',
        updatedAt: serverTimestamp()
      };

      if (editingItem.id) {
        await updateDoc(doc(db, 'menu', editingItem.id), menuData);
      } else {
        await addDoc(collection(db, 'menu'), menuData);
      }
      setEditingItem(null);
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan menu. Periksa koneksi atau database.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800000) { // approx 800KB limit for Firestore base64
        alert("Gambar terlalu besar! Maksimal 800KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingItem(prev => prev ? { ...prev, imageUrl: reader.result as string } : null);
      };
      reader.readAsDataURL(file);
    }
  };

  const deleteMenuItem = async (id: string) => {
    if (!confirm('Hapus menu ini?')) return;
    try {
      await deleteDoc(doc(db, 'menu', id));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMenu = useMemo(() => {
    return menu.filter(item => {
      const matchesCategory = activeCategory === 'Semua' || item.category === activeCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menu, activeCategory, searchQuery]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsPaymentModalOpen(true);
    setIsEnteringCash(false);
    setCashReceived(0);
  };

  const formatTransactionDate = (timestamp: any, pattern: string) => {
    try {
      if (!timestamp) return format(new Date(), pattern);
      if (typeof timestamp.toDate === 'function') return format(timestamp.toDate(), pattern);
      if (timestamp instanceof Date) return format(timestamp, pattern);
      return format(new Date(), pattern);
    } catch (e) {
      return format(new Date(), pattern);
    }
  };

  const processPayment = async (method: 'Cash' | 'QRIS') => {
    if (method === 'Cash' && !isEnteringCash) {
      setIsEnteringCash(true);
      return;
    }

    const changeAmount = method === 'Cash' ? Math.max(0, cashReceived - cartTotal) : 0;

    const transactionData = {
      items: cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
      total: cartTotal,
      cashReceived: method === 'Cash' ? cashReceived : cartTotal,
      change: changeAmount,
      paymentMethod: method,
      createdAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, 'transactions'), transactionData);
      setLastTransaction({ id: docRef.id, ...transactionData, createdAt: new Date() });
      setCart([]);
      setIsPaymentModalOpen(false);
      setIsReceiptOpen(true);
      setCashReceived(0);
      setIsEnteringCash(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
      alert("Gagal memproses transaksi. Coba lagi.");
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] flex flex-col md:flex-row font-sans text-[#3d3d3d] overflow-hidden">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-24 bg-[#5A5A40] flex md:flex-col items-center py-4 md:py-8 gap-8 px-4 md:px-0 scrollbar-hide overflow-x-auto md:overflow-y-auto">
        <div className="hidden md:flex flex-col items-center gap-1 mb-4">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-white">
            <ChefHat className="w-6 h-6" />
          </div>
        </div>
        
        <nav className="flex md:flex-col gap-4">
          {[
            { id: 'Semua', icon: LayoutGrid, label: 'Semua' },
            { id: 'Makanan utama', icon: ChefHat, label: 'Utama' },
            { id: 'Lauk', icon: Drumstick, label: 'Lauk' },
            { id: 'Minuman', icon: Coffee, label: 'Minum' },
            { id: 'Lainnya', icon: Package, label: 'Lainnya' }
          ].map((cat) => (
            <button 
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-2xl transition-all min-w-[70px]",
                activeCategory === cat.id 
                  ? "bg-white/10 text-white" 
                  : "text-white/60 hover:bg-white/5"
              )}
            >
              <cat.icon className="w-6 h-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">{cat.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto flex md:flex-col gap-4">
          {isAdmin && (
            <button 
              onClick={() => setIsManagementOpen(true)}
              className="p-3 rounded-2xl text-white/60 hover:bg-white/5"
            >
              <SettingsIcon className="w-6 h-6" />
            </button>
          )}
          <button 
            onClick={handleLogout}
            className="p-3 rounded-2xl text-white/60 hover:bg-red-500/20 hover:text-red-200"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="shrink-0 h-20 bg-[#fdfbf7] px-4 lg:px-6 flex items-center justify-between z-10 border-b border-[#f0f0e8] gap-4">
          <div className="flex flex-col shrink-0">
            <h2 className="text-xl lg:text-2xl font-serif font-bold text-[#2a2a1b] leading-tight">Menu Restoran</h2>
            <p className="text-[9px] lg:text-[10px] text-[#8a8a70] font-bold uppercase tracking-[0.2em]">{format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}</p>
          </div>
          
          <div className="relative max-w-xs flex-1 lg:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a8a70] w-4 h-4" />
            <input 
              type="text" 
              placeholder="Cari menu favorit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#e5e5d1] rounded-full focus:ring-2 focus:ring-[#5A5A40]/20 text-sm font-medium transition-all"
            />
          </div>

          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
             <div className="text-right hidden md:block max-w-[80px] lg:max-w-none">
               <p className="text-xs lg:text-sm font-bold text-[#2a2a1b] leading-none mb-1 truncate">{user.displayName}</p>
               <p className="text-[8px] lg:text-[9px] font-black text-[#5A5A40] uppercase tracking-widest truncate">{isAdmin ? 'Administrator' : 'Kasir Shift'}</p>
             </div>
             <img src={user.photoURL || ''} alt="avatar" className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl object-cover ring-2 ring-white shadow-sm border border-[#e5e5d1]" />
          </div>
        </header>

        {/* Menu Grid */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-hide bg-[#fdfbf7]">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6 pb-20">
            <AnimatePresence mode='popLayout'>
              {filteredMenu.map((item) => (
                <motion.button
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => addToCart(item)}
                  className="bg-white rounded-[28px] p-3 lg:p-4 border border-[#f0f0e8] shadow-sm hover:shadow-lg transition-all text-left flex flex-col group relative overflow-hidden active:scale-95"
                >
                  <div className="aspect-[4/3] bg-[#fcfcf9] rounded-2xl mb-3 lg:mb-4 overflow-hidden relative border border-[#f0f0e8]">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#e5e5d1]">
                        <UtensilsCrossed className="w-8 h-8" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 px-2.5 py-1 bg-white/90 backdrop-blur-sm rounded-full shadow-sm border border-[#f0f0e8]">
                      <p className="text-[9px] font-black text-[#5A5A40] uppercase tracking-wider">{item.category}</p>
                    </div>
                  </div>
                  <h3 className="font-bold text-[#2a2a1b] text-sm lg:text-base mb-1 line-clamp-1 group-hover:text-[#5A5A40] transition-colors">{item.name}</h3>
                  <p className="text-[#8a8a70] text-[10px] italic mb-2 line-clamp-1 opacity-70">Pilihan favorit pelanggan</p>
                  <p className="font-serif font-black text-base lg:text-lg text-[#5A5A40]">{formatCurrency(item.price)}</p>
                  
                  <div className="absolute right-3 lg:right-4 bottom-3 lg:bottom-4 w-8 lg:w-9 h-8 lg:h-9 bg-[#5A5A40] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all shadow-md shadow-[#5a5a40]/40">
                    <Plus className="w-4 h-4" />
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <aside className="w-full md:w-[320px] lg:w-[400px] bg-white border-l border-[#f0f0e8] flex flex-col h-[50vh] md:h-screen shadow-2xl md:shadow-none z-20">
        <div className="p-4 lg:p-6 border-b border-[#f0f0e8] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#fdfbf7] rounded-xl flex items-center justify-center border border-[#e5e5d1]">
              <ShoppingCart className="w-5 h-5 text-[#5A5A40]" />
            </div>
            <h2 className="text-lg lg:text-xl font-bold text-[#2a2a1b]">Pesanan</h2>
           </div>
           <span className="px-2.5 py-1 bg-[#5A5A40] rounded-full text-[10px] font-black text-white uppercase tracking-tighter">{cart.length} Unit</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 scrollbar-hide">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 grayscale">
              <ShoppingCart className="w-16 h-16 mb-4" />
              <p className="font-bold text-[#2a2a1b]">Siap Melayani</p>
              <p className="text-sm">Pilih menu untuk memulai pesanan</p>
            </div>
          ) : (
            cart.map((item) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-4 group"
              >
                <div className="w-16 h-16 bg-[#fdfbf7] rounded-xl shrink-0 overflow-hidden border border-[#f0f0e8]">
                  {item.imageUrl && <img src={item.imageUrl} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm truncate text-[#2a2a1b]">{item.name}</h4>
                  <p className="font-serif font-bold text-[#5A5A40] text-sm">{formatCurrency(item.price)}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center bg-[#fdfbf7] border border-[#e5e5d1] rounded-xl p-1">
                      <button 
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 hover:bg-white rounded-lg transition-colors text-[#5A5A40]"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1 hover:bg-white rounded-lg transition-colors text-[#5A5A40]"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => removeFromCart(item.id)}
                  className="text-[#e5e5d1] hover:text-red-500 self-start p-1 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </motion.div>
            ))
          )}
        </div>

        <div className="p-6 bg-[#fcfcf9] border-t border-[#f0f0e8] space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between text-[#8a8a70] font-medium text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            <div className="pt-3 border-t border-dashed border-[#e5e5d1] flex justify-between items-center">
              <span className="text-lg font-bold text-[#2a2a1b]">Total Bayar</span>
              <span className="text-2xl font-serif font-bold text-[#5A5A40]">{formatCurrency(cartTotal)}</span>
            </div>
          </div>
          
          <button 
            disabled={cart.length === 0}
            onClick={handleCheckout}
            className="w-full bg-[#5A5A40] hover:bg-[#4a4a35] disabled:bg-[#e8e8d8] disabled:shadow-none text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-[#5A5A40]/10 flex items-center justify-center gap-2 group"
          >
            <span>Bayar & Cetak</span>
            <Printer className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsPaymentModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl overflow-hidden border border-[#f0f0e8]"
            >
              <div className="absolute top-0 right-0 p-4">
                <button onClick={() => setIsPaymentModalOpen(false)} className="text-[#8a8a70] hover:text-[#3d3d3d]">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {!isEnteringCash ? (
                <>
                  <h2 className="text-2xl font-serif font-bold mb-2 text-center text-[#2a2a1b]">Pilih Pembayaran</h2>
                  <p className="text-[#8a8a70] text-center mb-8">Metode pembayaran pelanggan</p>

                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => processPayment('Cash')}
                      className="flex flex-col items-center gap-4 p-6 bg-[#fdfbf7] border-2 border-transparent hover:border-[#5A5A40] rounded-3xl transition-all group"
                    >
                      <div className="w-16 h-16 bg-[#fcfcf9] border border-[#e5e5d1] rounded-2xl flex items-center justify-center text-[#5A5A40] group-hover:scale-110 transition-transform">
                        <Banknote className="w-8 h-8" />
                      </div>
                      <span className="font-bold text-[#2a2a1b]">Tunai</span>
                    </button>
                    <button 
                      onClick={() => processPayment('QRIS')}
                      className="flex flex-col items-center gap-4 p-6 bg-[#fdfbf7] border-2 border-transparent hover:border-[#5A5A40] rounded-3xl transition-all group"
                    >
                      <div className="w-16 h-16 bg-[#fcfcf9] border border-[#e5e5d1] rounded-2xl flex items-center justify-center text-[#5A5A40] group-hover:scale-110 transition-transform">
                        <CreditCard className="w-8 h-8" />
                      </div>
                      <span className="font-bold text-[#2a2a1b]">QRIS</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="animate-in slide-in-from-right duration-300">
                  <h2 className="text-2xl font-serif font-bold mb-2 text-center text-[#2a2a1b]">Bayar Tunai</h2>
                  <p className="text-[#8a8a70] text-center mb-6">Masukkan jumlah uang diterima</p>
                  
                  <div className="space-y-4">
                    <div className="relative">
                      <input 
                        autoFocus
                        type="number"
                        placeholder="Jumlah uang..."
                        onChange={(e) => setCashReceived(Number(e.target.value))}
                        className="w-full text-3xl font-serif font-bold text-center py-4 bg-[#fdfbf7] border border-[#e5e5d1] rounded-2xl focus:ring-4 focus:ring-[#5A5A40]/10 transition-all outline-none"
                      />
                    </div>
                    
                    <div className="bg-[#fdfbf7] p-4 rounded-2xl space-y-2 border border-[#f0f0e8]">
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8a8a70]">Tagihan:</span>
                        <span className="font-bold">{formatCurrency(cartTotal)}</span>
                      </div>
                      <div className="flex justify-between text-lg">
                        <span className="text-[#8a8a70] font-medium">Kembalian:</span>
                        <span className="font-black text-green-600">{formatCurrency(Math.max(0, cashReceived - cartTotal))}</span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={() => setIsEnteringCash(false)}
                        className="flex-1 py-4 bg-gray-100 font-bold rounded-2xl"
                      >
                        Batal
                      </button>
                      <button 
                        disabled={cashReceived < cartTotal}
                        onClick={() => processPayment('Cash')}
                        className="flex-[2] py-4 bg-[#5A5A40] text-white font-bold rounded-2xl shadow-lg shadow-[#5A5A40]/20 disabled:bg-gray-300 disabled:shadow-none transition-all"
                      >
                        Selesaikan Pembayaran
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8 pt-8 border-t border-dashed border-[#e5e5d1] text-center">
                <p className="text-xs text-[#8a8a70] mb-1 font-bold uppercase tracking-widest">Total Pesanan</p>
                <p className="text-4xl font-serif font-bold text-[#5A5A40]">{formatCurrency(cartTotal)}</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Modal (Success) */}
      <AnimatePresence>
        {isReceiptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 receipt-overlay">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              id="printable-receipt"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-white rounded-[32px] p-0 max-w-[340px] w-full shadow-2xl overflow-hidden flex flex-col items-center border border-[#f0f0e8] max-h-[90vh]"
            >
              <div className="shrink-0 w-full bg-[#5A5A40] py-4 flex flex-col items-center relative overflow-hidden print-header">
                <div className="absolute inset-0 opacity-5 flex flex-wrap gap-1 pointer-events-none">
                  {[...Array(12)].map((_, i) => <ChefHat key={i} className="w-6 h-6 text-white" />)}
                </div>
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mb-1 ring-4 ring-white/10 ring-offset-2 ring-offset-[#5A5A40]">
                  <ChefHat className="w-5 h-5 shadow-sm text-white" />
                </div>
                <h3 className="text-white font-serif font-bold text-lg">Mirah Echo</h3>
              </div>

              <div className="flex-1 overflow-y-auto p-6 w-full scrollbar-hide printable-content bg-white">
                <div className="text-center mb-6 flex flex-col items-center">
                  <div className="text-[#5A5A40] mb-3">
                    <UtensilsCrossed className="w-10 h-10" />
                  </div>
                  <h2 className="text-xl font-serif font-bold text-[#1a1a1a] leading-tight uppercase tracking-tight">Nasi pecel Madiun Mirah Echo</h2>
                  <p className="text-[11px] text-[#555] font-medium mt-1">Jl. Raya Madiun No. 88, Jawa Timur</p>
                  <p className="text-[11px] text-[#555] font-medium">Telp: (021) 1234-5678</p>
                  <div className="my-5 border-t border-dashed border-[#d1d1c1] w-full" />
                </div>

                <div className="space-y-2 text-[11px] mb-6 font-mono">
                  <div className="flex text-[#333]">
                    <span className="w-28 text-left">No. Transaksi</span>
                    <span className="flex-1 text-left font-bold">: {lastTransaction?.id?.slice(0, 10).toUpperCase()}</span>
                  </div>
                  <div className="flex text-[#333]">
                    <span className="w-28 text-left">Tanggal</span>
                    <span className="flex-1 text-left font-bold">: {formatTransactionDate(lastTransaction?.createdAt, 'dd/MM/yyyy')}</span>
                  </div>
                  <div className="flex text-[#333]">
                    <span className="w-28 text-left">Waktu</span>
                    <span className="flex-1 text-left font-bold">: {formatTransactionDate(lastTransaction?.createdAt, 'HH.mm')}</span>
                  </div>
                  <div className="flex text-[#333]">
                    <span className="w-28 text-left">Kasir</span>
                    <span className="flex-1 text-left font-bold">: {user?.displayName || 'Kasir'}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-[#d1d1c1] py-4 mb-4">
                  {lastTransaction?.items.map((item: any, idx: number) => (
                    <div key={`receipt-item-${idx}`} className="flex justify-between text-[12px] mb-3 text-[#000] leading-relaxed font-mono">
                      <span className="flex-1 pr-4">{item.name} <span className="text-[#666] ml-1">×{item.quantity}</span></span>
                      <span className="font-bold shrink-0">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 pt-4 border-t border-dashed border-[#d1d1c1] font-mono">
                  <div className="flex justify-between text-[11px] text-[#333]">
                    <span>Subtotal</span>
                    <span className="text-[#000] font-bold">{formatCurrency(lastTransaction?.total)}</span>
                  </div>
                  <div className="flex justify-between text-base pt-2 pb-2 border-y border-[#eee] mb-2">
                    <span className="font-black text-[#000]">TOTAL</span>
                    <span className="font-black text-[#5A5A40]">{formatCurrency(lastTransaction?.total)}</span>
                  </div>
                  
                  {lastTransaction?.paymentMethod === 'Cash' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#333]">
                        <span>Tunai Diterima</span>
                        <span className="text-[#000] font-bold">{formatCurrency(lastTransaction?.cashReceived)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-green-700 font-bold border-t border-[#f0f0f0] pt-1">
                        <span>Kembalian</span>
                        <span>{formatCurrency(lastTransaction?.change)}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between text-[10px] text-[#999] pt-6 font-sans italic border-t border-[#f7f7f7]">
                    <span>Metode: {lastTransaction?.paymentMethod}</span>
                  </div>
                </div>

                <div className="mt-10 text-center border-t border-dashed border-[#d1d1c1] pt-8 pb-4">
                  <div className="flex justify-center items-center gap-2 mb-3">
                    <span className="text-yellow-500 text-sm">★</span>
                    <p className="text-[11px] text-[#1a1a1a] font-bold uppercase tracking-[0.2em] leading-tight">Terima Kasih</p>
                    <span className="text-yellow-500 text-sm">★</span>
                  </div>
                  <p className="text-[10px] text-[#8a8a70] italic text-center mb-1">Selamat menikmati hidangan Anda!</p>
                  <p className="text-[8px] text-[#ccc] text-center uppercase tracking-widest mt-2">Struk Pembayaran Sah</p>
                </div>
              </div>

              <div className="shrink-0 w-full p-6 flex gap-2 border-t border-[#f0f0e8] bg-white print:hidden">
                <button 
                  onClick={() => window.print()}
                  className="flex-1 bg-[#fdfbf7] border border-[#e5e5d1] hover:bg-[#f0f0e8] text-[#5A5A40] font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all text-sm shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  Cetak
                </button>
                <button 
                  onClick={() => setIsReceiptOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold py-3 rounded-xl transition-all text-sm"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Management Modal */}
      <AnimatePresence>
        {isManagementOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsManagementOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-[40px] p-0 max-w-4xl w-full h-[80vh] shadow-2xl overflow-hidden border border-[#f0f0e8] flex flex-col"
            >
              <div className="p-6 border-b border-[#f0f0e8] flex justify-between items-center">
                <h2 className="text-2xl font-serif font-bold text-[#2a2a1b]">Panel Manajemen</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setManagementTab('Menu')}
                    className={cn("px-4 py-2 rounded-xl font-bold text-sm", managementTab === 'Menu' ? "bg-[#5A5A40] text-white" : "bg-gray-100 text-gray-500")}
                  >
                    Menu
                  </button>
                  <button 
                    onClick={() => setManagementTab('Transaksi')}
                    className={cn("px-4 py-2 rounded-xl font-bold text-sm", managementTab === 'Transaksi' ? "bg-[#5A5A40] text-white" : "bg-gray-100 text-gray-500")}
                  >
                    Transaksi
                  </button>
                </div>
                <button onClick={() => setIsManagementOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {managementTab === 'Menu' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold">Daftar Menu ({menu.length})</h3>
                      <button 
                        onClick={() => setEditingItem({ name: '', price: 0, category: 'Makanan utama' })}
                        className="bg-[#5A5A40] text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold"
                      >
                        <Plus className="w-4 h-4" /> Tambah Menu
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {menu.map(item => (
                        <div key={item.id} className="p-4 bg-[#fdfbf7] border border-[#e5e5d1] rounded-2xl flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-[#f0f0e8] overflow-hidden">
                              {item.imageUrl ? <img src={item.imageUrl} className="object-cover w-full h-full" /> : <div className="p-2 text-[#e5e5d1]"><ChefHat className="w-full h-full" /></div>}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{item.name}</p>
                              <p className="text-xs text-[#5A5A40] font-bold">{formatCurrency(item.price)}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingItem(item)} className="p-2 hover:bg-white rounded-lg text-blue-600 border border-transparent hover:border-blue-100"><Plus className="w-4 h-4" /></button>
                            <button onClick={() => deleteMenuItem(item.id)} className="p-2 hover:bg-white rounded-lg text-red-500 border border-transparent hover:border-red-100"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {managementTab === 'Transaksi' && (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <CreditCard className="w-16 h-16 mb-4 opacity-20" />
                    <h3 className="font-bold mb-2">Pantau Cashflow Anda</h3>
                    <p className="text-sm text-[#8a8a70] mb-8">Download semua data transaksi dalam format Excel untuk melihat laporan keuangan lengkap</p>
                    <button 
                      onClick={exportToExcel}
                      className="bg-[#5A5A40] text-white px-8 py-4 rounded-2xl flex items-center gap-3 font-bold hover:bg-[#4a4a35] transition-all"
                    >
                      <FileSpreadsheet className="w-5 h-5" /> Ekspor ke Excel (.xlsx)
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Menu Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingItem(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-[#f0f0e8]"
            >
              <h2 className="text-xl font-serif font-bold mb-6 text-[#2a2a1b]">{editingItem.id ? 'Edit Menu' : 'Tambah Menu'}</h2>
              <form onSubmit={saveMenu} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Nama Menu</label>
                  <input 
                    required
                    type="text" 
                    value={editingItem.name || ''}
                    onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Harga (Rp)</label>
                  <input 
                    required
                    type="number" 
                    value={editingItem.price === 0 ? '' : editingItem.price}
                    onChange={(e) => setEditingItem({...editingItem, price: e.target.value === '' ? 0 : Number(e.target.value)})}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl"
                    placeholder="Masukkan harga..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Kategori</label>
                  <select 
                    value={editingItem.category || 'Makanan utama'}
                    onChange={(e) => setEditingItem({...editingItem, category: e.target.value})}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl"
                  >
                    <option value="Makanan utama">Makanan utama</option>
                    <option value="Lauk">Lauk</option>
                    <option value="Minuman">Minuman</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Foto Menu</label>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                       <input 
                        type="text" 
                        value={editingItem.imageUrl || ''}
                        onChange={(e) => setEditingItem({...editingItem, imageUrl: e.target.value})}
                        className="flex-1 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm"
                        placeholder="Link foto..."
                      />
                      <label className="shrink-0 cursor-pointer bg-white border-2 border-dashed border-[#e5e5d1] hover:border-[#5A5A40] text-[#5A5A40] p-3 rounded-xl flex items-center transition-all group">
                        <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    </div>
                    
                    {editingItem.imageUrl && (
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-[#f0f0e8]">
                        <img src={editingItem.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                        <button 
                          type="button"
                          onClick={() => setEditingItem({...editingItem, imageUrl: ''})}
                          className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setEditingItem(null)} className="flex-1 py-3 bg-gray-100 font-bold rounded-xl">Batal</button>
                  <button type="submit" className="flex-1 py-3 bg-[#5A5A40] text-white font-bold rounded-xl shadow-lg shadow-[#5A5A40]/10">Simpan</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @media screen {
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        }

        @media print {
          @page {
            margin: 0;
            size: 80mm auto;
          }
          
          /* Hide everything by default */
          body * {
            visibility: hidden !important;
          }

          /* Specifically show ONLY the receipt content and its necessary parents */
          .receipt-overlay, 
          .receipt-overlay * {
            visibility: visible !important;
          }

          .receipt-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            display: block !important;
            background: white !important;
            z-index: 9999 !important;
          }

          /* Hide UI elements within overlay during print */
          .receipt-overlay button,
          .receipt-overlay .absolute.inset-0.bg-black\/80.backdrop-blur-md,
          .print\:hidden {
            display: none !important;
            visibility: hidden !important;
          }

          #printable-receipt {
            position: relative !important;
            width: 80mm !important;
            margin: 0 auto !important;
            padding: 0 !important;
            display: block !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            transform: none !important;
            border-radius: 0 !important;
          }

          .printable-content {
            padding: 10mm 5mm !important;
            display: block !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }

          .print-header {
            display: none !important; /* Hide the green banner in print to save ink */
          }

          #printable-receipt * {
            color: black !important;
            font-family: 'JetBrains Mono', monospace !important;
          }

          .text-green-700 {
            color: black !important;
          }
        }
      `}</style>
    </div>
  );
}
