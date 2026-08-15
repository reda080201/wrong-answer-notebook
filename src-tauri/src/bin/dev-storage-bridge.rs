fn main() {
    if let Err(error) = wrong_answer_notebook_lib::run_dev_storage_bridge() {
        eprintln!("[dev storage bridge] {error}");
        std::process::exit(1);
    }
}
