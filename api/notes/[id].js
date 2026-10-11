import handler from '../notes.js';

export default function noteHandler(req, res) {
  req.noteItemRoute = true;
  return handler(req, res);
}
