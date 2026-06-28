import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginRegister from "./LoginRegister.jsx";
import Dashboard from "./Dashboard.jsx";
import Browse from "./Browse.jsx";
import Profile from "./Profile.jsx";
import LandingPage from "./LandingPage.jsx";
import FavoriteAuthor from "./FavoriteAuthor.jsx";
import AuthorLogin from "./AuthorLogin";
import AuthorRegister from "./AuthorRegister";
import PublisherDashboard from "./PublisherDashboard.jsx";
import UploadBook from "./UploadBook.jsx";
import PaymentPage from "./PaymentPage.jsx";
import OpenBookPage from "./OpenBookPage.jsx";
import AuthorProfile from "./AuthorProfile.jsx";
import ForgotPassword from "./ForgotPassword.jsx";
import EditBook from "./EditBook.jsx";
import ModeratorDashboard from "./ModeratorDashboard.jsx";
import ModeratorAuth from "./ModeratorAuth.jsx";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/Dashboard" element={<Dashboard />}>
          <Route path="Profile" element={<Profile />} />
          <Route path="FavoriteAuthor" element={<FavoriteAuthor />} />
        </Route>
        <Route path="/Browse" element={<Browse />} />
        <Route path="/AuthorProfile" element={<AuthorProfile />} />
        <Route path="/LandingPage" element={<LandingPage />} />
        <Route path="/AuthorLogin" element={<AuthorLogin/>}/>
        <Route path="/PublisherDashboard" element={<PublisherDashboard/>}/>
        <Route path="/AuthorRegister" element={<AuthorRegister/>}/>
        <Route path="/login-register" element={<LoginRegister />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/UploadBook" element={<UploadBook />} />
        <Route path="/edit-book/:bookId" element={<EditBook />} />
        <Route path="/moderator-dashboard" element={<ModeratorDashboard />} />
        <Route path="/moderator-auth" element={<ModeratorAuth />} />
        <Route path="/PaymentPage" element={<PaymentPage />} />
        <Route path="/OpenBookPage/:bookId" element={<OpenBookPage />} />
      </Routes>
    </Router>
  );
}

export default App;
