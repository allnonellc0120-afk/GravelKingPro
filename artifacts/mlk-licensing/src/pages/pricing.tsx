import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { useGetMlkProducts, getGetMlkProductsQueryKey, useSubmitMlkInquiry } from "@workspace/api-client-react";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MlkInquiryInputTier } from "@workspace/api-client-react";

export default function Pricing() {
  const { data: products, isLoading } = useGetMlkProducts({ query: { queryKey: getGetMlkProductsQueryKey() } });
  const [selectedTier, setSelectedTier] = useState<MlkInquiryInputTier | null>(null);
  const { mutate: submitInquiry, isPending } = useSubmitMlkInquiry();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    nodeCount: "",
    message: ""
  });

  const handleInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTier) return;
    
    submitInquiry({
      data: {
        ...formData,
        tier: selectedTier
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Inquiry Submitted",
          description: "Our engineering team will contact you securely within 24 hours.",
        });
        setSelectedTier(null);
        setFormData({ name: "", email: "", company: "", nodeCount: "", message: "" });
      },
      onError: () => {
        toast({
          title: "Submission Failed",
          description: "An error occurred. Please try again.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-12">
        <div className="mb-12">
          <h1 className="text-3xl font-bold uppercase mb-4">Commercial Licensing</h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            MLK V3.5 is licensed exclusively to verified enterprise organizations. All tiers include direct engineering support.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {products?.map((product) => (
              <div 
                key={product.id} 
                className={`flex flex-col border p-8 bg-card ${product.highlighted ? 'border-primary shadow-md' : 'border-border'}`}
              >
                {product.highlighted && (
                  <div className="text-xs font-bold uppercase tracking-wider text-accent mb-4 font-mono">
                    Most Common Deployment
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-bold uppercase mb-2">{product.name}</h3>
                  <div className="text-3xl font-mono font-bold">{product.priceLabel}</div>
                  <p className="text-sm text-muted-foreground mt-2 min-h-[3rem]">{product.description}</p>
                </div>
                
                <ul className="space-y-3 mb-8 flex-1">
                  {product.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <Check className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <span className="text-sm leading-tight">{feature}</span>
                    </li>
                  ))}
                  <li className="flex items-start pt-2 border-t mt-4">
                    <span className="text-xs font-mono text-muted-foreground">MAX MATRIX: {product.matrixSize}x{product.matrixSize}</span>
                  </li>
                </ul>

                <button 
                  onClick={() => setSelectedTier(product.tier as MlkInquiryInputTier)}
                  className={`w-full h-12 flex items-center justify-center text-sm font-medium uppercase tracking-wider transition-colors ${
                    product.highlighted 
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  Request License
                </button>
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!selectedTier} onOpenChange={(open) => !open && setSelectedTier(null)}>
          <DialogContent className="sm:max-w-[500px] rounded-none border-border">
            <DialogHeader>
              <DialogTitle className="uppercase font-bold text-xl">Secure Inquiry</DialogTitle>
              <DialogDescription>
                Provide your details. An NDA will be required before binary delivery.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInquiry} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="font-mono text-xs uppercase">Full Name</Label>
                <Input id="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="rounded-none font-mono" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono text-xs uppercase">Corporate Email</Label>
                <Input id="email" type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="rounded-none font-mono" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company" className="font-mono text-xs uppercase">Organization</Label>
                <Input id="company" required value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="rounded-none font-mono" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nodes" className="font-mono text-xs uppercase">Expected Node Count (Optional)</Label>
                <Input id="nodes" value={formData.nodeCount} onChange={e => setFormData({...formData, nodeCount: e.target.value})} className="rounded-none font-mono" placeholder="e.g. 256" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message" className="font-mono text-xs uppercase">Additional Requirements</Label>
                <Textarea id="message" value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="rounded-none font-mono resize-none" rows={3} />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setSelectedTier(null)}
                  className="px-4 py-2 text-sm border font-medium hover:bg-secondary transition-colors uppercase"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isPending}
                  className="px-6 py-2 text-sm bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center uppercase disabled:opacity-50"
                >
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
