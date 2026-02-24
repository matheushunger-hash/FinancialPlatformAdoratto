import { ARImportView } from "@/components/ar/ar-import-view";

export default function RecebimentosImportarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Importar Recebimentos
        </h1>
        <p className="text-muted-foreground">
          Faça upload da planilha RPInfo Flex (.xlsx) para importar transações
          de cartão.
        </p>
      </div>
      <ARImportView />
    </div>
  );
}
