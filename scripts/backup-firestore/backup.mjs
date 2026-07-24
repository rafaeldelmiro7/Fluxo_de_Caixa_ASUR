// Gera um backup completo do Firestore do Fluxo de Caixa, no mesmo formato
// produzido pelo botao "Backup Completo" do app (window.exportarBackup em fluxo-caixa.html).
// Autentica via GOOGLE_APPLICATION_CREDENTIALS (chave de servico do Firebase).

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';

// mantenha em sincronia com _EMPRESA_SEED_V em fluxo-caixa.html
const VERSAO = 4;

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function fetchCollection(path) {
  const snap = await db.collection(path).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fetchDadosEmpresa(eid) {
  const [bancos, categorias, lancamentos, fornecedores] = await Promise.all([
    fetchCollection(`empresas/${eid}/bancos`),
    fetchCollection(`empresas/${eid}/categorias`),
    fetchCollection(`empresas/${eid}/lancamentos`),
    fetchCollection(`empresas/${eid}/fornecedores`),
  ]);
  return { bancos, categorias, lancamentos, fornecedores };
}

async function main() {
  const empresasSnap = await db.collection('config').doc('empresas').get();
  const empresas = empresasSnap.exists ? (empresasSnap.data().lista || []) : [];

  const usersSnap = await db.collection('config').doc('users').get();
  const users = usersSnap.exists ? (usersSnap.data().lista || []) : [];

  if (empresas.length === 0) {
    throw new Error('Nenhuma empresa encontrada em config/empresas — abortando (verifique a credencial e o projeto do Firebase).');
  }

  const dadosPorEmpresa = {};
  for (const emp of empresas) {
    dadosPorEmpresa[emp.id] = await fetchDadosEmpresa(emp.id);
  }

  const payload = {
    tipo: 'backup_completo',
    versao: VERSAO,
    exportadoEm: new Date().toISOString(),
    empresas,
    users,
    dadosPorEmpresa,
  };

  const dataStr = new Date().toISOString().slice(0, 10);
  const filename = `backup_fluxo_caixa_${dataStr}.json`;
  writeFileSync(filename, JSON.stringify(payload, null, 2));

  const totalLancamentos = Object.values(dadosPorEmpresa).reduce((a, d) => a + d.lancamentos.length, 0);
  console.log(`Backup gerado: ${filename}`);
  console.log(`Empresas: ${empresas.length} | Usuarios: ${users.length} | Lancamentos totais: ${totalLancamentos}`);
}

main().catch(err => {
  console.error('Falha ao gerar backup:', err);
  process.exit(1);
});
