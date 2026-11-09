// Lazy boundary: pdfmake + font VFS bundle into one on-demand chunk, kept out of
// page loads and the service-worker install prefetch (matched by PDFDocument).
import pdfMake from 'pdfmake-rtl/build/pdfmake';
import pdfVfs from 'pdfmake-rtl/build/vfs_fonts';

export { pdfMake, pdfVfs };