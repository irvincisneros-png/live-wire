import './ui/styles.css';
import { startShell } from './ui/shell';

const root = document.getElementById('app');
if (root) startShell(root);
