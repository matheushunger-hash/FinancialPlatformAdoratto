"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  supplierFormSchema,
  type SupplierFormData,
  formatCNPJ,
  formatCPF,
  stripDocument,
} from "@/lib/suppliers/validation";
import type { SupplierListItem } from "@/lib/suppliers/types";

// =============================================================================
// SupplierForm — The create/edit form for suppliers
// =============================================================================
// Uses react-hook-form + Zod for validation. The form has 4 sections:
//   1. Dados Principais (name, document type, document, trade name)
//   2. Contato (contact name, email, phone)
//   3. Dados Bancários (bank name, agency, account, PIX key)
//   4. Observações (notes)
//
// Key behaviors:
//   - Document field formats on blur (adds dots/slashes/dashes)
//   - Changing document type clears the document field
//   - Server-side uniqueness errors are mapped to form field errors
//   - Submit sends POST (create) or PATCH (edit) to the API
// =============================================================================

interface SupplierFormProps {
  supplier: SupplierListItem | null;
  onSuccess: () => void;
}

export function SupplierForm({ supplier, onSuccess }: SupplierFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const isEditing = supplier !== null;

  // Initialize react-hook-form with Zod validation
  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      documentType: supplier?.documentType ?? "CNPJ",
      document: supplier
        ? supplier.documentType === "CNPJ"
          ? formatCNPJ(supplier.document)
          : formatCPF(supplier.document)
        : "",
      tradeName: supplier?.tradeName ?? "",
      contactName: supplier?.contactName ?? "",
      email: supplier?.email ?? "",
      phone: supplier?.phone ?? "",
      bankName: supplier?.bankName ?? "",
      bankAgency: supplier?.bankAgency ?? "",
      bankAccount: supplier?.bankAccount ?? "",
      pixKey: supplier?.pixKey ?? "",
      notes: supplier?.notes ?? "",
    },
  });

  // Strip non-digits and cap at the max digit count on every change (typing or paste)
  function handleDocumentChange(value: string) {
    const maxDigits = form.getValues("documentType") === "CNPJ" ? 14 : 11;
    const digits = stripDocument(value).slice(0, maxDigits);
    form.setValue("document", digits);
  }

  // Format the document field when the user leaves the input
  function handleDocumentBlur() {
    const docType = form.getValues("documentType");
    const raw = stripDocument(form.getValues("document"));

    if (docType === "CNPJ" && raw.length === 14) {
      form.setValue("document", formatCNPJ(raw));
    } else if (docType === "CPF" && raw.length === 11) {
      form.setValue("document", formatCPF(raw));
    }
  }

  async function onSubmit(data: SupplierFormData) {
    setSubmitting(true);

    try {
      const url = isEditing
        ? `/api/suppliers/${supplier.id}`
        : "/api/suppliers";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        // Try to parse JSON error — the server might return HTML on unexpected errors
        let errorData: { error?: string; field?: string } = {};
        try {
          errorData = await res.json();
        } catch {
          toast.error(`Erro do servidor (${res.status})`);
          return;
        }

        // If it's a uniqueness error, show it on the document field
        if (res.status === 409 && errorData.field === "document") {
          form.setError("document", { message: errorData.error });
          return;
        }

        toast.error(errorData.error || "Erro ao salvar fornecedor");
        return;
      }

      toast.success(
        isEditing
          ? "Fornecedor atualizado com sucesso"
          : "Fornecedor criado com sucesso",
      );
      onSuccess();
    } catch {
      toast.error("Erro ao salvar fornecedor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-4 pb-4">
        {/* Section 1: Dados Principais */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Dados Principais
          </legend>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome / Razão Social</FormLabel>
                <FormControl>
                  <Input placeholder="Nome do fornecedor" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="documentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Clear document when type changes — different formats
                      form.setValue("document", "");
                      form.clearErrors("document");
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CNPJ">CNPJ</SelectItem>
                      <SelectItem value="CPF">CPF</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="document"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Documento</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        form.watch("documentType") === "CNPJ"
                          ? "00.000.000/0000-00"
                          : "000.000.000-00"
                      }
                      {...field}
                      onChange={(e) => handleDocumentChange(e.target.value)}
                      onBlur={() => {
                        field.onBlur();
                        handleDocumentBlur();
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="tradeName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome Fantasia</FormLabel>
                <FormControl>
                  <Input placeholder="Nome fantasia (opcional)" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Section 2: Contato */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Contato
          </legend>

          <FormField
            control={form.control}
            name="contactName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do Contato</FormLabel>
                <FormControl>
                  <Input placeholder="Nome da pessoa de contato" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@exemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input placeholder="(11) 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        {/* Section 3: Dados Bancários */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Dados Bancários
          </legend>

          <FormField
            control={form.control}
            name="bankName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Banco</FormLabel>
                <FormControl>
                  <Input placeholder="Nome do banco" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="bankAgency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agência</FormLabel>
                  <FormControl>
                    <Input placeholder="0000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bankAccount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conta</FormLabel>
                  <FormControl>
                    <Input placeholder="00000-0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="pixKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Chave PIX</FormLabel>
                <FormControl>
                  <Input placeholder="CPF, e-mail, celular ou chave aleatória" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Section 4: Observações */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Observações
          </legend>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notas</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Observações adicionais sobre o fornecedor..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Submit button */}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Salvar Alterações" : "Criar Fornecedor"}
        </Button>
      </form>
    </Form>
  );
}
