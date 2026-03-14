import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Building2, Plus, Trash2 } from "lucide-react";

interface NewCompany {
  name: string;
  cvr: string;
}

export default function GroupOnboarding() {
  const { companyName, companyId } = useAuth();
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [newCompanies, setNewCompanies] = useState<NewCompany[]>([]);
  const [loading, setLoading] = useState(false);

  const addCompany = () => {
    setNewCompanies((prev) => [...prev, { name: "", cvr: "" }]);
  };

  const removeCompany = (index: number) => {
    setNewCompanies((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCompany = (index: number, field: keyof NewCompany, value: string) => {
    setNewCompanies((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast({ title: "Fejl", description: "Koncernnavn er påkrævet", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Build companies array
      const companies: any[] = [];

      // Attach existing company if user has one
      if (companyId) {
        companies.push({ mode: "attach", company_id: companyId });
      }

      // Add new companies
      for (const nc of newCompanies) {
        if (nc.name.trim()) {
          companies.push({ mode: "create", name: nc.name.trim(), cvr: nc.cvr.trim() || null });
        }
      }

      const { data, error } = await supabase.functions.invoke("create-group", {
        body: { group_name: groupName.trim(), companies },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Koncern oprettet", description: `${groupName} er nu oprettet` });
      navigate("/group/setup-complete");
    } catch (err: any) {
      console.error("Group creation failed:", err);
      toast({
        title: "Fejl ved oprettelse",
        description: err.message || "Kunne ikke oprette koncern",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Opret koncern</CardTitle>
          <CardDescription>
            Saml dine virksomheder under én koncernstruktur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="groupName">Koncernnavn</Label>
              <Input
                id="groupName"
                placeholder="F.eks. Hansen Holding"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                required
              />
            </div>

            {companyName && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">Din nuværende virksomhed</p>
                <p className="font-medium">{companyName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bliver automatisk tilknyttet som ankervirksomhed
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Yderligere virksomheder</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCompany}>
                  <Plus className="h-4 w-4 mr-1" /> Tilføj
                </Button>
              </div>

              {newCompanies.map((company, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Virksomhedsnavn"
                      value={company.name}
                      onChange={(e) => updateCompany(index, "name", e.target.value)}
                    />
                    <Input
                      placeholder="CVR (valgfrit)"
                      value={company.cvr}
                      onChange={(e) => updateCompany(index, "cvr", e.target.value)}
                      maxLength={8}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCompany(index)}
                    className="mt-1"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}

              {newCompanies.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Du kan tilføje flere virksomheder til koncernen her
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Opretter koncern..." : "Opret koncern"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
